import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requirePermission } from '../auth/authorization.js';
import { isLeaveBalance, isPositiveInteger } from '../validation.js';
import {
  currentDepartmentSql,
  currentJobTitleSql,
  currentOrganizationJoin
} from '../organization/current-organization-query.js';
import { ensureOrganizationSchema } from './organization.js';

export const leaveManagementRouter = Router();
const balanceColumnByLeaveType = {
  vacation: 'vacation_leave',
  sick: 'sick_leave',
  emergency: 'emergency_leave'
};

leaveManagementRouter.get('/employees', ...requirePermission('leave_management', 'view'), async (request, response, next) => {
  try {
    await ensureOrganizationSchema();
    const search = String(request.query.search || '').trim();
    const pattern = `%${search}%`;
    const result = await pool.query(
      `SELECT employee.id, employee.employee_number AS "employeeNumber",
              employee.first_name AS "firstName", employee.last_name AS "lastName",
              employee.preferred_name AS "preferredName", employee.email,
              ${currentJobTitleSql} AS "jobTitle", ${currentDepartmentSql} AS department,
              COALESCE(balance.vacation_leave, 0)::double precision AS "vacationLeave",
              COALESCE(balance.sick_leave, 0)::double precision AS "sickLeave",
              COALESCE(balance.emergency_leave, 0)::double precision AS "emergencyLeave"
       FROM employee_profiles employee
       ${currentOrganizationJoin}
       LEFT JOIN employee_leave_balances balance ON balance.employee_id = employee.id
       WHERE employee.employment_status = 'active'
         AND ($1 = '' OR employee.employee_number ILIKE $2 OR employee.first_name ILIKE $2
           OR employee.last_name ILIKE $2 OR employee.preferred_name ILIKE $2
           OR employee.email ILIKE $2 OR ${currentJobTitleSql} ILIKE $2
           OR ${currentDepartmentSql} ILIKE $2)
       ORDER BY employee.last_name, employee.first_name`,
      [search, pattern]
    );
    return response.json({ employees: result.rows });
  } catch (error) { return next(error); }
});

leaveManagementRouter.put('/employees/:employeeId', ...requirePermission('leave_management', 'update'), async (request, response, next) => {
  try {
    const employeeId = String(request.params.employeeId || '');
    const balances = {
      vacationLeave: request.body?.vacationLeave,
      sickLeave: request.body?.sickLeave,
      emergencyLeave: request.body?.emergencyLeave
    };
    if (!isPositiveInteger(employeeId)) return response.status(400).json({ error: 'A valid employee is required.' });
    if (Object.values(balances).some((value) => !isLeaveBalance(value))) {
      return response.status(400).json({ error: 'Leave balances must be between 0 and 999 days with no more than two decimal places.' });
    }
    const result = await pool.query(
      `INSERT INTO employee_leave_balances
         (employee_id, vacation_leave, sick_leave, emergency_leave, updated_by)
       SELECT id, $2, $3, $4, $5 FROM employee_profiles
       WHERE id = $1 AND employment_status = 'active'
       ON CONFLICT (employee_id) DO UPDATE SET
         vacation_leave = EXCLUDED.vacation_leave,
         sick_leave = EXCLUDED.sick_leave,
         emergency_leave = EXCLUDED.emergency_leave,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING vacation_leave::double precision AS "vacationLeave",
         sick_leave::double precision AS "sickLeave",
         emergency_leave::double precision AS "emergencyLeave"`,
      [employeeId, balances.vacationLeave, balances.sickLeave, balances.emergencyLeave, request.user.id]
    );
    if (!result.rowCount) return response.status(404).json({ error: 'Active employee not found.' });
    return response.json({ balances: result.rows[0] });
  } catch (error) { return next(error); }
});

leaveManagementRouter.get('/requests', ...requirePermission('leave_management', 'view'), async (request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT leave_request.id, leave_request.leave_type AS "leaveType",
              TO_CHAR(leave_request.start_date, 'YYYY-MM-DD') AS "startDate",
              TO_CHAR(leave_request.end_date, 'YYYY-MM-DD') AS "endDate",
              leave_request.requested_days::double precision AS "requestedDays",
              leave_request.status, leave_request.created_at AS "createdAt",
              employee.id AS "employeeId",
              employee.employee_number AS "employeeNumber",
              employee.first_name AS "firstName", employee.last_name AS "lastName",
              employee.preferred_name AS "preferredName"
       FROM employee_leave_requests leave_request
       JOIN employee_profiles employee ON employee.id = leave_request.employee_id
       JOIN employee_profiles approver ON approver.id = leave_request.approver_employee_id
       WHERE approver.user_id = $1
       ORDER BY leave_request.status = 'pending' DESC, leave_request.created_at DESC
       LIMIT 200`,
      [request.user.id]
    );
    return response.json({ requests:result.rows });
  } catch (error) { return next(error); }
});

leaveManagementRouter.patch('/requests/:requestId/status', ...requirePermission('leave_management', 'update'), async (request, response, next) => {
  const requestId = String(request.params.requestId || '');
  const status = String(request.body?.status || '').toLowerCase();
  if (!isPositiveInteger(requestId) || !['approved', 'rejected'].includes(status)) {
    return response.status(400).json({ error: 'A valid pending request and review decision are required.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const requestResult = await client.query(
      `SELECT leave_request.id, leave_request.employee_id AS "employeeId",
              leave_request.leave_type AS "leaveType",
              leave_request.requested_days::double precision AS "requestedDays",
              leave_request.status, leave_request.credits_deducted AS "creditsDeducted"
       FROM employee_leave_requests leave_request
       JOIN employee_profiles approver ON approver.id = leave_request.approver_employee_id
       WHERE leave_request.id = $1 AND approver.user_id = $2
       FOR UPDATE OF leave_request`,
      [requestId, request.user.id]
    );
    if (!requestResult.rowCount) {
      await client.query('ROLLBACK');
      return response.status(404).json({ error: 'This leave request is not assigned to you.' });
    }
    const leaveRequest = requestResult.rows[0];
    if (leaveRequest.status !== 'pending') {
      await client.query('ROLLBACK');
      return response.status(409).json({ error: 'Only pending leave requests can be reviewed.' });
    }

    let balances = null;
    const balanceColumn = balanceColumnByLeaveType[leaveRequest.leaveType];
    if (status === 'approved' && !leaveRequest.creditsDeducted) {
      const balanceResult = await client.query(
        `UPDATE employee_leave_balances
         SET ${balanceColumn} = ${balanceColumn} - $2, updated_by = $3, updated_at = NOW()
         WHERE employee_id = $1 AND ${balanceColumn} >= $2
         RETURNING vacation_leave::double precision AS "vacationLeave",
           sick_leave::double precision AS "sickLeave",
           emergency_leave::double precision AS "emergencyLeave"`,
        [leaveRequest.employeeId, leaveRequest.requestedDays, request.user.id]
      );
      if (!balanceResult.rowCount) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: `This employee no longer has enough ${leaveRequest.leaveType} leave credits to approve the request.` });
      }
      balances = balanceResult.rows[0];
    }
    if (status === 'rejected' && leaveRequest.creditsDeducted) {
      const balanceResult = await client.query(
        `UPDATE employee_leave_balances
         SET ${balanceColumn} = ${balanceColumn} + $2, updated_by = $3, updated_at = NOW()
         WHERE employee_id = $1
         RETURNING vacation_leave::double precision AS "vacationLeave",
           sick_leave::double precision AS "sickLeave",
           emergency_leave::double precision AS "emergencyLeave"`,
        [leaveRequest.employeeId, leaveRequest.requestedDays, request.user.id]
      );
      if (!balanceResult.rowCount) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'The reserved leave credits could not be restored.' });
      }
      balances = balanceResult.rows[0];
    }

    const reviewedResult = await client.query(
      `UPDATE employee_leave_requests
       SET status = $2, reviewed_by = $3, reviewed_at = NOW(),
           credits_deducted = $4, updated_at = NOW()
       WHERE id = $1
       RETURNING id, status, reviewed_at AS "reviewedAt"`,
      [requestId, status, request.user.id, status === 'approved']
    );
    await client.query('COMMIT');
    return response.json({ request:reviewedResult.rows[0], balances });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally { client.release(); }
});
