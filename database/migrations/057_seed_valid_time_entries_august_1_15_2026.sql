DELETE FROM scheduler_backups WHERE agent_id = 'paytimepro-dummy-data';

INSERT INTO employee_shift_assignments (employee_id,shift_type,start_time,end_time,work_days)
SELECT id,'eight_to_five',TIME '08:00',TIME '17:00',ARRAY['monday','tuesday','wednesday','thursday','friday']::text[]
FROM employee_profiles
WHERE employment_status='active'
ON CONFLICT(employee_id) DO NOTHING;

WITH active_employees AS (
  SELECT employee.employee_number,shift.start_time AS shift_start,shift.end_time AS shift_end,shift.work_days
  FROM employee_profiles employee
  JOIN employee_shift_assignments shift ON shift.employee_id=employee.id
  WHERE employee.employment_status='active'
), scheduled_dates AS (
  SELECT employee.*,calendar.work_date::date AS work_date
  FROM active_employees employee
  CROSS JOIN GENERATE_SERIES(DATE '2026-08-01',DATE '2026-08-15',INTERVAL '1 day') AS calendar(work_date)
  WHERE LOWER(TO_CHAR(calendar.work_date,'FMDay'))=ANY(employee.work_days)
), punches AS (
  SELECT schedule.employee_number,schedule.work_date,punch.sequence,punch.punch_time
  FROM scheduled_dates schedule
  CROSS JOIN LATERAL (VALUES
    (1,schedule.shift_start),
    (2,schedule.shift_start+INTERVAL '4 hours'),
    (3,schedule.shift_start+INTERVAL '5 hours'),
    (4,schedule.shift_end-INTERVAL '2 hours'),
    (5,schedule.shift_end-INTERVAL '1 hour 45 minutes'),
    (6,schedule.shift_end)
  ) punch(sequence,punch_time)
), attendance AS (
  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
    'userId',employee_number,
    'timestamp',TO_CHAR(work_date+punch_time,'YYYY-MM-DD"T"HH24:MI:SS')||'+08:00',
    'source','dummy-valid-august-2026'
  ) ORDER BY work_date,employee_number,sequence),'[]'::jsonb) AS records
  FROM punches
), device_users AS (
  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('userId',employee_number)),'[]'::jsonb) AS records
  FROM active_employees
)
INSERT INTO scheduler_backups(agent_id,captured_at,device,users,attendance)
SELECT 'paytimepro-dummy-data',TIMESTAMPTZ '2026-08-15 18:00:00+08',
       '{"name":"Dummy Attendance Generator","serialNumber":"DEMO-AUG-2026"}'::jsonb,
       device_users.records,attendance.records
FROM attendance CROSS JOIN device_users
WHERE JSONB_ARRAY_LENGTH(attendance.records)>0;
