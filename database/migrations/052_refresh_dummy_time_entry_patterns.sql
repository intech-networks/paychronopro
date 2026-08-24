DELETE FROM scheduler_backups WHERE agent_id = 'paytimepro-dummy-data';

INSERT INTO employee_shift_assignments (employee_id, shift_type, start_time, end_time, work_days)
SELECT id, 'eight_to_five', TIME '08:00', TIME '17:00', ARRAY['monday','tuesday','wednesday','thursday','friday']::text[]
FROM employee_profiles
WHERE employment_status = 'active'
ON CONFLICT (employee_id) DO NOTHING;

WITH active_employees AS (
  SELECT employee.employee_number,
         COALESCE(shift.start_time, TIME '08:00') AS shift_start,
         COALESCE(shift.end_time, TIME '17:00') AS shift_end
  FROM employee_profiles employee
  LEFT JOIN employee_shift_assignments shift ON shift.employee_id = employee.id
  WHERE employee.employment_status = 'active'
), work_dates AS (
  SELECT employee.*,
         (DATE_TRUNC('week', CURRENT_DATE)::date + pattern.day_offset) AS work_date,
         pattern.exception_type
  FROM active_employees employee
  CROSS JOIN (VALUES
    (0, 'late_first_in'),
    (1, 'late_required_break'),
    (2, 'absent'),
    (3, 'incomplete'),
    (4, 'undertime_short_break')
  ) pattern(day_offset, exception_type)
), punches AS (
  SELECT work_day.employee_number, work_day.work_date, punch.sequence, punch.punch_time
  FROM work_dates work_day
  CROSS JOIN LATERAL (VALUES
    (1, CASE work_day.exception_type WHEN 'late_first_in' THEN work_day.shift_start + INTERVAL '18 minutes' WHEN 'absent' THEN NULL ELSE work_day.shift_start END),
    (2, CASE WHEN work_day.exception_type = 'absent' THEN NULL ELSE TIME '12:00' END),
    (3, CASE work_day.exception_type WHEN 'late_required_break' THEN TIME '13:20' WHEN 'undertime_short_break' THEN TIME '12:30' WHEN 'absent' THEN NULL ELSE TIME '13:00' END),
    (4, CASE WHEN work_day.exception_type = 'absent' THEN NULL ELSE TIME '15:00' END),
    (5, CASE WHEN work_day.exception_type IN ('absent', 'incomplete') THEN NULL ELSE TIME '15:15' END),
    (6, CASE work_day.exception_type WHEN 'absent' THEN NULL WHEN 'undertime_short_break' THEN work_day.shift_end - INTERVAL '60 minutes' ELSE work_day.shift_end END)
  ) punch(sequence, punch_time)
  WHERE punch.punch_time IS NOT NULL
), attendance AS (
  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
    'userId', employee_number,
    'timestamp', TO_CHAR(work_date + punch_time, 'YYYY-MM-DD"T"HH24:MI:SS') || '+08:00',
    'source', 'dummy-exception-seed'
  ) ORDER BY work_date, employee_number, sequence), '[]'::jsonb) AS records
  FROM punches
), device_users AS (
  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('userId', employee_number)), '[]'::jsonb) AS records
  FROM active_employees
)
INSERT INTO scheduler_backups (agent_id, captured_at, device, users, attendance)
SELECT 'paytimepro-dummy-data', NOW(),
       '{"name":"Dummy Attendance Generator","serialNumber":"DEMO"}'::jsonb,
       device_users.records, attendance.records
FROM attendance CROSS JOIN device_users
WHERE JSONB_ARRAY_LENGTH(attendance.records) > 0;
