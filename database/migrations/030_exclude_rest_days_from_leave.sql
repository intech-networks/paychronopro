WITH recalculated AS (
  SELECT leave_request.id, leave_request.employee_id, leave_request.leave_type,
         leave_request.requested_days,
         leave_request.credits_deducted,
         COUNT(*) FILTER (
           WHERE LOWER(TRIM(TO_CHAR(day_value, 'Day'))) = ANY(
             COALESCE(shift.work_days, ARRAY['monday','tuesday','wednesday','thursday','friday']::TEXT[])
           )
         )::NUMERIC AS working_days
  FROM employee_leave_requests leave_request
  LEFT JOIN employee_shift_assignments shift ON shift.employee_id = leave_request.employee_id
  CROSS JOIN LATERAL GENERATE_SERIES(leave_request.start_date, leave_request.end_date, INTERVAL '1 day') day_value
  GROUP BY leave_request.id, shift.work_days
), adjustments AS (
  SELECT employee_id,
         SUM(CASE WHEN credits_deducted AND leave_type = 'vacation' THEN requested_days - working_days ELSE 0 END) AS vacation_days,
         SUM(CASE WHEN credits_deducted AND leave_type = 'sick' THEN requested_days - working_days ELSE 0 END) AS sick_days,
         SUM(CASE WHEN credits_deducted AND leave_type = 'emergency' THEN requested_days - working_days ELSE 0 END) AS emergency_days
  FROM recalculated
  WHERE working_days > 0 AND working_days < requested_days
  GROUP BY employee_id
)
UPDATE employee_leave_balances balance
SET vacation_leave = balance.vacation_leave + adjustment.vacation_days,
    sick_leave = balance.sick_leave + adjustment.sick_days,
    emergency_leave = balance.emergency_leave + adjustment.emergency_days,
    updated_at = NOW()
FROM adjustments adjustment
WHERE balance.employee_id = adjustment.employee_id;

WITH recalculated AS (
  SELECT leave_request.id,
         COUNT(*) FILTER (
           WHERE LOWER(TRIM(TO_CHAR(day_value, 'Day'))) = ANY(
             COALESCE(shift.work_days, ARRAY['monday','tuesday','wednesday','thursday','friday']::TEXT[])
           )
         )::NUMERIC AS working_days
  FROM employee_leave_requests leave_request
  LEFT JOIN employee_shift_assignments shift ON shift.employee_id = leave_request.employee_id
  CROSS JOIN LATERAL GENERATE_SERIES(leave_request.start_date, leave_request.end_date, INTERVAL '1 day') day_value
  GROUP BY leave_request.id, shift.work_days
)
UPDATE employee_leave_requests leave_request
SET requested_days = recalculated.working_days, updated_at = NOW()
FROM recalculated
WHERE leave_request.id = recalculated.id
  AND recalculated.working_days > 0
  AND leave_request.requested_days <> recalculated.working_days;
