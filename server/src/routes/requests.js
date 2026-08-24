import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requirePermission } from '../auth/authorization.js';
import { isPositiveInteger } from '../validation.js';

export const requestsRouter = Router();

const balanceColumnByLeaveType = {
  vacation: 'vacation_leave',
  sick: 'sick_leave',
  emergency: 'emergency_leave'
};

requestsRouter.get('/', ...requirePermission('requests', 'view'), async (request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT leave_request.id, 'leave' AS "requestType",
              leave_request.leave_type AS "leaveType",
              TO_CHAR(leave_request.start_date, 'YYYY-MM-DD') AS "startDate",
              TO_CHAR(leave_request.end_date, 'YYYY-MM-DD') AS "endDate",
              leave_request.requested_days::double precision AS "requestedDays",
              leave_request.status, leave_request.created_at AS "createdAt",
              leave_request.reviewed_at AS "reviewedAt",
              requester.id AS "employeeId", requester.employee_number AS "employeeNumber",
              requester.first_name AS "firstName", requester.last_name AS "lastName",
              requester.preferred_name AS "preferredName",
              COALESCE(shift.work_days, ARRAY['monday','tuesday','wednesday','thursday','friday']::TEXT[]) AS "workDays"
       FROM employee_leave_requests leave_request
       JOIN employee_profiles requester ON requester.id = leave_request.employee_id
       JOIN employee_profiles reviewer ON reviewer.user_id = $1
       LEFT JOIN employee_shift_assignments shift ON shift.employee_id = requester.id
       WHERE requester.id <> reviewer.id
         AND leave_request.approver_employee_id = reviewer.id
       ORDER BY leave_request.status = 'pending' DESC, leave_request.created_at DESC
       LIMIT 500`,
      [request.user.id]
    );
    return response.json({ requests:result.rows });
  } catch (error) { return next(error); }
});

requestsRouter.patch('/leave/:requestId/review', ...requirePermission('requests', 'update'), async (request, response, next) => {
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
              leave_request.status, leave_request.credits_deducted AS "creditsDeducted",
              reviewer.id AS "reviewerEmployeeId"
       FROM employee_leave_requests leave_request
       JOIN employee_profiles reviewer ON reviewer.user_id = $2
       WHERE leave_request.id = $1
         AND leave_request.employee_id <> reviewer.id
         AND leave_request.approver_employee_id = reviewer.id
       FOR UPDATE OF leave_request`,
      [requestId, request.user.id]
    );
    if (!requestResult.rowCount) {
      await client.query('ROLLBACK');
      return response.status(404).json({ error: 'This request is not assigned to you.' });
    }

    const leaveRequest = requestResult.rows[0];
    if (leaveRequest.status !== 'pending') {
      await client.query('ROLLBACK');
      return response.status(409).json({ error: 'Only pending requests can be reviewed.' });
    }

    const balanceColumn = balanceColumnByLeaveType[leaveRequest.leaveType];
    if (status === 'approved' && !leaveRequest.creditsDeducted) {
      const balanceResult = await client.query(
        `UPDATE employee_leave_balances
         SET ${balanceColumn} = ${balanceColumn} - $2, updated_by = $3, updated_at = NOW()
         WHERE employee_id = $1 AND ${balanceColumn} >= $2`,
        [leaveRequest.employeeId, leaveRequest.requestedDays, request.user.id]
      );
      if (!balanceResult.rowCount) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: `This employee no longer has enough ${leaveRequest.leaveType} leave credits to approve the request.` });
      }
    }
    if (status === 'rejected' && leaveRequest.creditsDeducted) {
      const balanceResult = await client.query(
        `UPDATE employee_leave_balances
         SET ${balanceColumn} = ${balanceColumn} + $2, updated_by = $3, updated_at = NOW()
         WHERE employee_id = $1`,
        [leaveRequest.employeeId, leaveRequest.requestedDays, request.user.id]
      );
      if (!balanceResult.rowCount) {
        await client.query('ROLLBACK');
        return response.status(409).json({ error: 'The reserved leave credits could not be restored.' });
      }
    }

    const reviewedResult = await client.query(
      `UPDATE employee_leave_requests
       SET status = $2, reviewed_by = $3, reviewed_at = NOW(),
           credits_deducted = $4, approver_employee_id = $5,
           routed_at = COALESCE(routed_at, NOW()), updated_at = NOW()
       WHERE id = $1
       RETURNING id, status, reviewed_at AS "reviewedAt"`,
      [requestId, status, request.user.id, status === 'approved', leaveRequest.reviewerEmployeeId]
    );
    await client.query('COMMIT');
    return response.json({ request:reviewedResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally { client.release(); }
});
