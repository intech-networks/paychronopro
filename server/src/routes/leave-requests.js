import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requirePermission } from '../auth/authorization.js';
import { isIsoDate, isPositiveInteger } from '../validation.js';
import { countLeaveWorkDays } from '../time/leave-days.js';
import { holidayOccurrencesByDate } from '../calendar/service.js';

export const leaveRequestsRouter = Router();
const validLeaveTypes = new Set(['vacation', 'sick', 'emergency']);
const balanceColumnByLeaveType = {
  vacation: 'vacation_leave',
  sick: 'sick_leave',
  emergency: 'emergency_leave'
};

leaveRequestsRouter.get('/me', ...requirePermission('leave_application', 'view'), async (request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT employee.id, employee.employee_number AS "employeeNumber",
              employee.first_name AS "firstName", employee.last_name AS "lastName",
              employee.preferred_name AS "preferredName",
              COALESCE(shift.work_days, ARRAY['monday','tuesday','wednesday','thursday','friday']::TEXT[]) AS "workDays",
              COALESCE(balance.vacation_leave, 0)::double precision AS "vacationLeave",
              COALESCE(balance.sick_leave, 0)::double precision AS "sickLeave",
              COALESCE(balance.emergency_leave, 0)::double precision AS "emergencyLeave"
       FROM employee_profiles employee
       LEFT JOIN employee_leave_balances balance ON balance.employee_id = employee.id
       LEFT JOIN employee_shift_assignments shift ON shift.employee_id = employee.id
       WHERE employee.user_id = $1 LIMIT 1`,
      [request.user.id]
    );
    if (!result.rowCount) return response.status(404).json({ error: 'Your employee profile is not linked to this account.' });
    const employee = result.rows[0];
    const leaveBalances = {
      vacationLeave: employee.vacationLeave,
      sickLeave: employee.sickLeave,
      emergencyLeave: employee.emergencyLeave
    };
    delete employee.vacationLeave;
    delete employee.sickLeave;
    delete employee.emergencyLeave;
    const requestsResult = await pool.query(
      `SELECT request.id, request.leave_type AS "leaveType",
              TO_CHAR(request.start_date, 'YYYY-MM-DD') AS "startDate",
              TO_CHAR(request.end_date, 'YYYY-MM-DD') AS "endDate",
              request.requested_days::double precision AS "requestedDays",
              request.status, request.created_at AS "createdAt",
              approver.first_name AS "approverFirstName", approver.last_name AS "approverLastName",
              approver.preferred_name AS "approverPreferredName"
       FROM employee_leave_requests request
       LEFT JOIN employee_profiles approver ON approver.id = request.approver_employee_id
       WHERE request.employee_id = $1
       ORDER BY request.created_at DESC
       LIMIT 100`,
      [employee.id]
    );
    const approvalsResult = await pool.query(
      `SELECT leave_request.id, leave_request.leave_type AS "leaveType",
              TO_CHAR(leave_request.start_date, 'YYYY-MM-DD') AS "startDate",
              TO_CHAR(leave_request.end_date, 'YYYY-MM-DD') AS "endDate",
              leave_request.requested_days::double precision AS "requestedDays",
              leave_request.status, leave_request.created_at AS "createdAt",
              requester.employee_number AS "employeeNumber",
              requester.first_name AS "firstName", requester.last_name AS "lastName",
              requester.preferred_name AS "preferredName"
       FROM employee_leave_requests leave_request
       JOIN employee_profiles approver ON approver.id = leave_request.approver_employee_id
       JOIN employee_profiles requester ON requester.id = leave_request.employee_id
       WHERE approver.user_id = $1
       ORDER BY leave_request.status = 'pending' DESC, leave_request.created_at DESC
       LIMIT 100`,
      [request.user.id]
    );
    return response.json({ employee, leaveBalances, requests:requestsResult.rows, approvals:approvalsResult.rows });
  } catch (error) { return next(error); }
});

leaveRequestsRouter.patch('/:requestId/withdraw', ...requirePermission('leave_application', 'update'), async (request, response, next) => {
  const requestId = String(request.params.requestId || '');
  if (!isPositiveInteger(requestId)) return response.status(400).json({ error: 'A valid leave request is required.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT leave_request.id, leave_request.employee_id AS "employeeId",
              leave_request.leave_type AS "leaveType",
              leave_request.requested_days::double precision AS "requestedDays",
              leave_request.status, leave_request.credits_deducted AS "creditsDeducted"
       FROM employee_leave_requests leave_request
       JOIN employee_profiles employee ON employee.id = leave_request.employee_id
       WHERE leave_request.id = $1 AND employee.user_id = $2
       FOR UPDATE OF leave_request`,
      [requestId, request.user.id]
    );
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return response.status(404).json({ error: 'Leave request not found.' });
    }
    const leaveRequest = current.rows[0];
    if (leaveRequest.status !== 'pending') {
      await client.query('ROLLBACK');
      return response.status(409).json({ error: 'Only pending leave requests can be withdrawn.' });
    }
    let balances = null;
    if (leaveRequest.creditsDeducted) {
      const balanceColumn = balanceColumnByLeaveType[leaveRequest.leaveType];
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
    const result = await client.query(
      `UPDATE employee_leave_requests
       SET status = 'cancelled', credits_deducted = FALSE, updated_at = NOW()
       WHERE id = $1
       RETURNING id, status`,
      [requestId]
    );
    await client.query('COMMIT');
    return response.json({ request:result.rows[0], balances });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally { client.release(); }
});

leaveRequestsRouter.patch('/:requestId/review', ...requirePermission('leave_application', 'update'), async (request, response, next) => {
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
    const balanceColumn = balanceColumnByLeaveType[leaveRequest.leaveType];
    let balances = null;
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

leaveRequestsRouter.post('/', ...requirePermission('leave_application', 'create'), async (request, response, next) => {
  let client;
  let transactionStarted = false;
  try {
    const leaveType = String(request.body?.leaveType || '').toLowerCase();
    const startDate = String(request.body?.startDate || '');
    const endDate = String(request.body?.endDate || '');
    if (!validLeaveTypes.has(leaveType)) return response.status(400).json({ error: 'Select a valid leave type.' });
    if (!startDate || !endDate || !isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
      return response.status(400).json({ error: 'Select a valid leave date range.' });
    }
    const calendarDays = Math.round((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 86400000) + 1;
    if (calendarDays > 365) return response.status(400).json({ error: 'A leave request cannot exceed 365 calendar days.' });
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    const employeeResult = await client.query(
      `SELECT employee.id,
              COALESCE(shift.work_days, ARRAY['monday','tuesday','wednesday','thursday','friday']::TEXT[]) AS "workDays"
       FROM employee_profiles employee
       LEFT JOIN employee_shift_assignments shift ON shift.employee_id = employee.id
       WHERE employee.user_id = $1 AND employee.employment_status = 'active' LIMIT 1`,
      [request.user.id]
    );
    if (!employeeResult.rowCount) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return response.status(404).json({ error: 'Your active employee profile is not linked to this account.' });
    }
    const holidaysByDate = await holidayOccurrencesByDate({ startDate, endDate, client });
    const requestedDays = countLeaveWorkDays(startDate, endDate, employeeResult.rows[0].workDays, holidaysByDate.keys());
    if (!requestedDays) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return response.status(400).json({ error: 'The selected range contains only rest days or company holidays.' });
    }
    const approverResult = await client.query(
        `SELECT manager.id
         FROM organization_assignments requester_assignment
         JOIN employee_profiles manager ON manager.id=requester_assignment.manager_employee_id
         JOIN users manager_user ON manager_user.id=manager.user_id AND manager_user.is_active=TRUE
         WHERE requester_assignment.employee_id=$1
           AND requester_assignment.effective_from<=CURRENT_DATE
           AND (requester_assignment.effective_to IS NULL OR requester_assignment.effective_to>=CURRENT_DATE)
           AND manager.employment_status='active'
         LIMIT 1`,
        [employeeResult.rows[0].id]
      );
    if (!approverResult.rowCount) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return response.status(409).json({ error:'Your organization assignment does not have an active direct manager who can approve this request.' });
    }
    const balanceColumn = balanceColumnByLeaveType[leaveType];
    const balanceResult = await client.query(
      `UPDATE employee_leave_balances
       SET ${balanceColumn} = ${balanceColumn} - $2, updated_by = $3, updated_at = NOW()
       WHERE employee_id = $1 AND ${balanceColumn} >= $2
       RETURNING vacation_leave::double precision AS "vacationLeave",
         sick_leave::double precision AS "sickLeave",
         emergency_leave::double precision AS "emergencyLeave"`,
      [employeeResult.rows[0].id, requestedDays, request.user.id]
    );
    if (!balanceResult.rowCount) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return response.status(400).json({ error: `This request exceeds your available ${leaveType} leave credits.` });
    }
    const result = await client.query(
      `INSERT INTO employee_leave_requests
         (employee_id, leave_type, start_date, end_date, requested_days, credits_deducted, approver_employee_id, routed_at)
       VALUES ($1, $2, $3::date, $4::date, $5, TRUE, $6, NOW())
       RETURNING id, leave_type AS "leaveType", start_date AS "startDate",
         end_date AS "endDate", requested_days AS "requestedDays", status, created_at AS "createdAt"`,
      [employeeResult.rows[0].id, leaveType, startDate, endDate, requestedDays, approverResult.rows[0].id]
    );
    await client.query('COMMIT');
    transactionStarted = false;
    return response.status(201).json({ request:result.rows[0], balances:balanceResult.rows[0] });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    if (error.code === '23505') return response.status(409).json({ error: 'You already have a pending request for this leave type and date range.' });
    return next(error);
  } finally { client?.release(); }
});
