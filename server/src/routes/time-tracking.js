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

const reportDayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const timeMinutes = (value) => { const [hour,minute]=String(value).slice(0,5).split(':').map(Number); return hour*60+minute; };
function reportExceptions(punches, shift) {
  if (!punches.length) return ['Absent'];
  const exceptions=[];
  if (timeMinutes(punches[0].localTime)>timeMinutes(shift.startTime)) exceptions.push('Late · First In');
  if (punches.length<4||punches.length%2!==0) exceptions.push('Incomplete');
  if (punches.length>=3) {
    const breakMinutes=timeMinutes(punches[2].localTime)-timeMinutes(punches[1].localTime);
    if (breakMinutes>60) exceptions.push('Late · Break');
    if (breakMinutes<60) exceptions.push('Missed 1-hour break');
  }
  if (punches.length>=2&&timeMinutes(punches[punches.length-1].localTime)<timeMinutes(shift.endTime)) exceptions.push('Undertime');
  return exceptions;
}

timeTrackingRouter.get('/exemption-report', ...requirePermission('exemption_report', 'view'), async (request, response, next) => {
  try {
    const month=String(request.query.month||''),requestedStart=String(request.query.startDate||''),requestedEnd=String(request.query.endDate||'');
    let startDate,endDate;
    if (requestedStart||requestedEnd) {
      if (!isIsoDate(requestedStart)||!isIsoDate(requestedEnd)||requestedStart>requestedEnd||(new Date(`${requestedEnd}T00:00:00Z`)-new Date(`${requestedStart}T00:00:00Z`))/86400000>31) return response.status(400).json({error:'A valid report date range of up to 31 days is required.'});
      startDate=requestedStart;endDate=requestedEnd;
    } else {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return response.status(400).json({error:'A valid report month is required.'});
      const [year,monthNumber]=month.split('-').map(Number);
      startDate=`${month}-01`;endDate=new Date(Date.UTC(year,monthNumber,0)).toISOString().slice(0,10);
    }
    const todayParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
    const today=`${todayParts.year}-${todayParts.month}-${todayParts.day}`;
    const reportEnd=endDate<today?endDate:today;
    if (reportEnd<startDate) return response.json({month,startDate,endDate,days:[],employees:[],summary:{employees:0,scheduledDays:0,total:0,absent:0,late:0,incomplete:0,undertime:0,break:0}});
    const [employeesResult,entriesResult]=await Promise.all([
      pool.query(`SELECT employee.id,employee.employee_number AS "employeeNumber",employee.first_name AS "firstName",employee.last_name AS "lastName",
        COALESCE(TO_CHAR(shift.start_time,'HH24:MI'),'08:00') AS "startTime",COALESCE(TO_CHAR(shift.end_time,'HH24:MI'),'17:00') AS "endTime",
        COALESCE(shift.work_days,ARRAY['monday','tuesday','wednesday','thursday','friday']::text[]) AS "workDays"
        FROM employee_profiles employee LEFT JOIN employee_shift_assignments shift ON shift.employee_id=employee.id
        WHERE employee.employment_status='active' ORDER BY employee.last_name,employee.first_name`),
      pool.query(`SELECT attendance.entry->>'userId' AS "employeeNumber",attendance.entry->>'timestamp' AS timestamp,
        TO_CHAR((attendance.entry->>'timestamp')::timestamptz AT TIME ZONE 'Asia/Manila','YYYY-MM-DD') AS date,
        TO_CHAR((attendance.entry->>'timestamp')::timestamptz AT TIME ZONE 'Asia/Manila','HH24:MI') AS "localTime"
        FROM scheduler_backups backup CROSS JOIN LATERAL jsonb_array_elements(backup.attendance) attendance(entry)
        WHERE ((attendance.entry->>'timestamp')::timestamptz AT TIME ZONE 'Asia/Manila')::date BETWEEN $1::date AND $2::date
        ORDER BY timestamp`,[startDate,reportEnd])
    ]);
    const normalizeNumber=(value)=>/^\d+$/.test(String(value))?String(BigInt(value)):String(value);
    const entriesByEmployeeDate=new Map();
    for (const entry of entriesResult.rows) {
      const key=`${normalizeNumber(entry.employeeNumber)}:${entry.date}`;
      const list=entriesByEmployeeDate.get(key)||[];
      if (!list.length||new Date(entry.timestamp)-new Date(list[list.length-1].timestamp)>5*60*1000) list.push(entry);
      entriesByEmployeeDate.set(key,list);
    }
    const days=[];
    const summary={employees:employeesResult.rowCount,scheduledDays:0,total:0,absent:0,late:0,incomplete:0,undertime:0,break:0};
    for (let cursor=new Date(`${startDate}T00:00:00Z`);cursor<=new Date(`${reportEnd}T00:00:00Z`);cursor.setUTCDate(cursor.getUTCDate()+1)) {
      const date=cursor.toISOString().slice(0,10),dayName=reportDayNames[cursor.getUTCDay()],records=[];
      for (const employee of employeesResult.rows) {
        if (!employee.workDays.includes(dayName)) continue;
        summary.scheduledDays+=1;
        const punches=entriesByEmployeeDate.get(`${normalizeNumber(employee.employeeNumber)}:${date}`)||[];
        const exceptions=reportExceptions(punches,employee);
        if (exceptions.length) records.push({employeeId:employee.id,employeeNumber:employee.employeeNumber,employeeName:`${employee.firstName} ${employee.lastName}`,exceptions});
      }
      const counts={total:records.reduce((sum,item)=>sum+item.exceptions.length,0),absent:records.filter(item=>item.exceptions.includes('Absent')).length,late:records.filter(item=>item.exceptions.some(value=>value.startsWith('Late'))).length,incomplete:records.filter(item=>item.exceptions.includes('Incomplete')).length,undertime:records.filter(item=>item.exceptions.includes('Undertime')).length,break:records.filter(item=>item.exceptions.some(value=>value.includes('Break')||value.includes('break'))).length};
      for (const key of ['total','absent','late','incomplete','undertime','break']) summary[key]+=counts[key];
      days.push({date,weekday:cursor.toLocaleDateString('en-US',{timeZone:'UTC',weekday:'short'}),counts,records});
    }
    return response.json({month,startDate,endDate,days,summary,employees:employeesResult.rows.map(employee=>({id:employee.id,employeeNumber:employee.employeeNumber,employeeName:`${employee.firstName} ${employee.lastName}`}))});
  } catch(error){return next(error);}
});
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
              employee.preferred_name AS "preferredName",
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
              job_title AS "jobTitle", employment_status AS "employmentStatus"
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
              employee.job_title AS "jobTitle", employee.employment_status AS "employmentStatus"
       FROM employee_profiles employee
       WHERE ($2::boolean = TRUE OR employee.employee_number ILIKE $1 OR employee.first_name ILIKE $1 OR employee.last_name ILIKE $1
          OR employee.preferred_name ILIKE $1 OR employee.email ILIKE $1 OR employee.job_title ILIKE $1)
       ORDER BY employee.employment_status = 'active' DESC, employee.last_name, employee.first_name
       LIMIT CASE WHEN $2::boolean THEN 200 ELSE 20 END`,
      [pattern, showAll]
    );
    response.json({ employees: result.rows });
  } catch (error) { next(error); }
});
