import { Router } from 'express';
import { pool } from '../db/pool.js';
import { hasPermission, requireAuth, requirePermission } from '../auth/authorization.js';
import { isIsoDate, isPositiveInteger } from '../validation.js';
import { collapseNearbyTimeEntries } from '../time/filterEntries.js';

export const timeTrackingRouter = Router();

const presetShifts = {
  eight_to_five: ['08:00', '17:00'],
  nine_to_six: ['09:00', '18:00']
};
const validWorkDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const isTimeValue = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const selfServiceCalendarModules = new Set(['overtime_request', 'shift_change']);
const isDepartmentManager = (user) => String(user.role || '').toLowerCase() === 'department manager';

async function canViewDepartmentEmployee(userId, employeeId) {
  const result = await pool.query(
    `SELECT 1
     FROM employee_profiles manager
     JOIN department_assignments manager_assignment
       ON manager_assignment.employee_id = manager.id
      AND manager_assignment.assignment_role = 'manager'
     JOIN department_assignments assigned_employee
       ON assigned_employee.department_id = manager_assignment.department_id
     WHERE manager.user_id = $1 AND assigned_employee.employee_id = $2
     LIMIT 1`,
    [userId, employeeId]
  );
  return Boolean(result.rowCount);
}

timeTrackingRouter.get('/my-shift-calendar/:moduleKey', requireAuth, async (request, response, next) => {
  try {
    const moduleKey = String(request.params.moduleKey || '');
    if (!selfServiceCalendarModules.has(moduleKey)) return response.status(404).json({ error: 'Shift calendar module not found.' });
    if (!hasPermission(request.user, moduleKey, 'view')) return response.status(403).json({ error: 'You do not have permission to view this shift calendar.' });
    const result = await pool.query(
      `SELECT employee.id, employee.employee_number AS "employeeNumber",
              employee.first_name AS "firstName", employee.last_name AS "lastName",
              employee.preferred_name AS "preferredName",
              assignment.shift_type AS "shiftType",
              TO_CHAR(assignment.start_time, 'HH24:MI') AS "startTime",
              TO_CHAR(assignment.end_time, 'HH24:MI') AS "endTime",
              assignment.work_days AS "workDays"
       FROM employee_profiles employee
       LEFT JOIN employee_shift_assignments assignment ON assignment.employee_id = employee.id
       WHERE employee.user_id = $1 LIMIT 1`,
      [request.user.id]
    );
    if (!result.rowCount) return response.status(404).json({ error: 'Your employee profile is not linked to this account.' });
    const employee = result.rows[0];
    const shift = employee.startTime ? {
      shiftType: employee.shiftType,
      startTime: employee.startTime,
      endTime: employee.endTime,
      workDays: employee.workDays
    } : null;
    delete employee.shiftType;
    delete employee.startTime;
    delete employee.endTime;
    delete employee.workDays;
    return response.json({ employee, shift });
  } catch (error) { return next(error); }
});

timeTrackingRouter.get('/shifts', ...requirePermission('shift_management', 'view'), async (_request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT employee.id, employee.employee_number AS "employeeNumber",
              employee.first_name AS "firstName", employee.last_name AS "lastName",
              employee.preferred_name AS "preferredName", employee.department,
              employee.job_title AS "jobTitle", assignment.shift_type AS "shiftType",
              TO_CHAR(assignment.start_time, 'HH24:MI') AS "startTime",
              TO_CHAR(assignment.end_time, 'HH24:MI') AS "endTime",
              assignment.work_days AS "workDays"
       FROM employee_profiles employee
       LEFT JOIN employee_shift_assignments assignment ON assignment.employee_id = employee.id
       WHERE employee.employment_status = 'active'
       ORDER BY employee.last_name, employee.first_name`
    );
    return response.json({ employees: result.rows });
  } catch (error) { return next(error); }
});

timeTrackingRouter.put('/shifts/:employeeId', ...requirePermission('shift_management', 'update'), async (request, response, next) => {
  try {
    const employeeId = String(request.params.employeeId || '');
    const shiftType = String(request.body?.shiftType || '');
    const workDays = Array.isArray(request.body?.workDays) ? [...new Set(request.body.workDays.map((day) => String(day).toLowerCase()))] : [];
    if (!isPositiveInteger(employeeId) || !['eight_to_five', 'nine_to_six', 'custom'].includes(shiftType)) {
      return response.status(400).json({ error: 'A valid employee and shift are required.' });
    }
    const [startTime, endTime] = presetShifts[shiftType] || [String(request.body?.startTime || ''), String(request.body?.endTime || '')];
    if (!isTimeValue(startTime) || !isTimeValue(endTime) || startTime >= endTime) {
      return response.status(400).json({ error: 'Shift end time must be after its start time.' });
    }
    if (!workDays.length || workDays.some((day) => !validWorkDays.includes(day))) {
      return response.status(400).json({ error: 'Select at least one valid working day.' });
    }
    const result = await pool.query(
      `INSERT INTO employee_shift_assignments (employee_id, shift_type, start_time, end_time, work_days, updated_by)
       SELECT id, $2, $3::time, $4::time, $5::text[], $6 FROM employee_profiles
       WHERE id = $1 AND employment_status = 'active'
       ON CONFLICT (employee_id) DO UPDATE SET shift_type = EXCLUDED.shift_type,
         start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
         work_days = EXCLUDED.work_days, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING employee_id AS "employeeId", shift_type AS "shiftType",
         TO_CHAR(start_time, 'HH24:MI') AS "startTime", TO_CHAR(end_time, 'HH24:MI') AS "endTime",
         work_days AS "workDays"`,
      [employeeId, shiftType, startTime, endTime, workDays, request.user.id]
    );
    if (!result.rowCount) return response.status(404).json({ error: 'Active employee not found.' });
    return response.json({ assignment: result.rows[0] });
  } catch (error) { return next(error); }
});

timeTrackingRouter.get('/entries', ...requirePermission('time_entries', 'view'), async (request, response, next) => {
  try {
    let employeeId = String(request.query.employeeId || '');
    const startDate = String(request.query.startDate || '');
    const endDate = String(request.query.endDate || '');
    if (request.user.role === 'Employee') {
      const ownProfile = await pool.query('SELECT id FROM employee_profiles WHERE user_id = $1 LIMIT 1', [request.user.id]);
      if (!ownProfile.rowCount) return response.status(404).json({ error: 'Your employee profile is not linked to this account.' });
      const ownEmployeeId = String(ownProfile.rows[0].id);
      if (employeeId && employeeId !== ownEmployeeId) return response.status(403).json({ error: 'Employees can only view their own time entries.' });
      employeeId = ownEmployeeId;
    }
    if (!isPositiveInteger(employeeId) || !startDate || !endDate || !isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
      return response.status(400).json({ error: 'A valid employee and date range are required.' });
    }
    if (isDepartmentManager(request.user) && !await canViewDepartmentEmployee(request.user.id, employeeId)) {
      return response.status(403).json({ error: 'Department Managers can only view time entries for employees assigned to their department.' });
    }
    const [result, shiftResult] = await Promise.all([pool.query(
      `SELECT DISTINCT attendance.entry->>'timestamp' AS timestamp
       FROM employee_profiles employee
       CROSS JOIN scheduler_backups backup
       CROSS JOIN LATERAL jsonb_array_elements(backup.attendance) AS attendance(entry)
       WHERE employee.id=$1
         AND CASE
               WHEN attendance.entry->>'userId' ~ '^[0-9]+$'
                AND employee.employee_number ~ '^[0-9]+$'
               THEN (attendance.entry->>'userId')::numeric = employee.employee_number::numeric
               ELSE attendance.entry->>'userId' = employee.employee_number
             END
         AND ((attendance.entry->>'timestamp')::timestamptz AT TIME ZONE 'Asia/Manila')::date BETWEEN $2::date AND $3::date
       ORDER BY timestamp`,
      [employeeId, startDate, endDate]
    ), pool.query(
      `SELECT shift_type AS "shiftType", TO_CHAR(start_time, 'HH24:MI') AS "startTime",
              TO_CHAR(end_time, 'HH24:MI') AS "endTime", work_days AS "workDays"
       FROM employee_shift_assignments WHERE employee_id = $1`,
      [employeeId]
    )]);
    return response.json({ entries: collapseNearbyTimeEntries(result.rows), shift: shiftResult.rows[0] || null });
  } catch (error) { return next(error); }
});

timeTrackingRouter.get('/me', ...requirePermission('time_entries', 'view'), async (request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT id, employee_number AS "employeeNumber", first_name AS "firstName",
              last_name AS "lastName", preferred_name AS "preferredName", email,
              job_title AS "jobTitle", department, employment_status AS "employmentStatus"
       FROM employee_profiles WHERE user_id = $1 LIMIT 1`,
      [request.user.id]
    );
    if (!result.rowCount) return response.status(404).json({ error: 'Your employee profile is not linked to this account.' });
    return response.json({ employee: result.rows[0] });
  } catch (error) { return next(error); }
});

timeTrackingRouter.get('/employees', ...requirePermission('time_entries', 'view'), async (request, response, next) => {
  try {
    if (request.user.role === 'Employee') return response.status(403).json({ error: 'Employees can only view their own time entries.' });
    const search = String(request.query.search || '').trim();
    const showAll = request.query.showAll === 'true';
    if (!search && !showAll) return response.json({ employees: [] });
    const pattern = `%${search}%`;
    const result = await pool.query(
      `SELECT employee.id, employee.employee_number AS "employeeNumber", employee.first_name AS "firstName",
              employee.last_name AS "lastName", employee.preferred_name AS "preferredName", employee.email,
              employee.job_title AS "jobTitle", employee.department, employee.employment_status AS "employmentStatus"
       FROM employee_profiles employee
       WHERE ($2::boolean = TRUE OR employee.employee_number ILIKE $1 OR employee.first_name ILIKE $1 OR employee.last_name ILIKE $1
          OR employee.preferred_name ILIKE $1 OR employee.email ILIKE $1 OR employee.department ILIKE $1
          OR employee.job_title ILIKE $1)
         AND (
           $3::boolean = FALSE
           OR EXISTS (
             SELECT 1
             FROM employee_profiles manager
             JOIN department_assignments manager_assignment
               ON manager_assignment.employee_id = manager.id
              AND manager_assignment.assignment_role = 'manager'
             JOIN department_assignments assigned_employee
               ON assigned_employee.department_id = manager_assignment.department_id
             WHERE manager.user_id = $4 AND assigned_employee.employee_id = employee.id
           )
         )
       ORDER BY employee.employment_status = 'active' DESC, employee.last_name, employee.first_name
       LIMIT CASE WHEN $2::boolean THEN 200 ELSE 20 END`,
      [pattern, showAll, isDepartmentManager(request.user), request.user.id]
    );
    response.json({ employees: result.rows });
  } catch (error) { next(error); }
});
