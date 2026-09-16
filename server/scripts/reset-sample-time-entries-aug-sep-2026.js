import { pool } from '../src/db/pool.js';

if (!process.argv.includes('--execute')) {
  console.error('Refusing to replace time entries without --execute.');
  process.exit(1);
}

const sampleAgentIds = [
  'paytimepro-dummy-data',
  'paytimepro-sample-august-2026',
  'paytimepro-sample-aug-sep-2026'
];

const client = await pool.connect();

try {
  await client.query('BEGIN');

  const existing = await client.query(`
    SELECT COUNT(*)::integer AS backups,
           COALESCE(SUM(JSONB_ARRAY_LENGTH(attendance)), 0)::integer AS punches
    FROM scheduler_backups
  `);

  const schedules = await client.query(`
    INSERT INTO employee_shift_assignments (
      employee_id, shift_type, start_time, end_time, work_days
    )
    SELECT id, 'eight_to_five', TIME '08:00', TIME '17:00',
           ARRAY['monday','tuesday','wednesday','thursday','friday']::text[]
    FROM employee_profiles
    WHERE employment_status = 'active'
    ON CONFLICT (employee_id) DO NOTHING
    RETURNING employee_id
  `);

  const removedSamples = await client.query(
    'DELETE FROM scheduler_backups WHERE agent_id = ANY($1::text[])',
    [sampleAgentIds]
  );

  const cleared = await client.query(`
    UPDATE scheduler_backups
    SET attendance = '[]'::jsonb
    WHERE JSONB_ARRAY_LENGTH(attendance) > 0
  `);

  const inserted = await client.query(`
    WITH active_employees AS (
      SELECT employee.id,
             employee.employee_number,
             shift.start_time AS shift_start,
             shift.end_time AS shift_end,
             shift.work_days
      FROM employee_profiles employee
      JOIN employee_shift_assignments shift ON shift.employee_id = employee.id
      WHERE employee.employment_status = 'active'
    ), scheduled_dates AS (
      SELECT employee.*,
             calendar.work_date::date AS work_date
      FROM active_employees employee
      CROSS JOIN GENERATE_SERIES(
        DATE '2026-08-01', DATE '2026-09-15', INTERVAL '1 day'
      ) AS calendar(work_date)
      WHERE LOWER(TO_CHAR(calendar.work_date, 'FMDay')) = ANY(employee.work_days)
        AND NOT EXISTS (
          SELECT 1
          FROM company_holidays holiday
          WHERE holiday.status = 'active'
            AND (
              (NOT holiday.is_recurring AND calendar.work_date::date BETWEEN
                holiday.start_date AND COALESCE(holiday.end_date, holiday.start_date))
              OR
              (holiday.is_recurring AND TO_CHAR(calendar.work_date, 'MM-DD') BETWEEN
                TO_CHAR(holiday.start_date, 'MM-DD') AND
                TO_CHAR(COALESCE(holiday.end_date, holiday.start_date), 'MM-DD'))
            )
        )
    ), local_punches AS (
      SELECT schedule.employee_number,
             schedule.work_date,
             punch.sequence,
             punch.local_timestamp
      FROM scheduled_dates schedule
      CROSS JOIN LATERAL (VALUES
        (1, schedule.work_date + schedule.shift_start),
        (2, schedule.work_date + schedule.shift_start + INTERVAL '4 hours'),
        (3, schedule.work_date + schedule.shift_start + INTERVAL '5 hours'),
        (4, schedule.work_date + schedule.shift_end +
            CASE WHEN schedule.shift_end <= schedule.shift_start
              THEN INTERVAL '1 day' ELSE INTERVAL '0 days' END)
      ) punch(sequence, local_timestamp)
    ), attendance AS (
      SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
        'userId', employee_number,
        'timestamp', TO_CHAR(local_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS') || '+08:00',
        'source', 'sample-aug-sep-2026'
      ) ORDER BY local_timestamp, employee_number, sequence), '[]'::jsonb) AS records
      FROM local_punches
    ), device_users AS (
      SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
        'userId', employee_number
      ) ORDER BY employee_number), '[]'::jsonb) AS records
      FROM active_employees
    )
    INSERT INTO scheduler_backups (
      agent_id, captured_at, device, users, attendance
    )
    SELECT 'paytimepro-sample-aug-sep-2026',
           TIMESTAMPTZ '2026-09-15 18:00:00+08',
           '{"name":"August-September 2026 Sample Attendance","serialNumber":"DEMO-AUG-SEP-2026"}'::jsonb,
           device_users.records,
           attendance.records
    FROM attendance CROSS JOIN device_users
    WHERE JSONB_ARRAY_LENGTH(attendance.records) > 0
    RETURNING id, JSONB_ARRAY_LENGTH(users)::integer AS employee_count,
              JSONB_ARRAY_LENGTH(attendance)::integer AS punch_count
  `);

  if (!inserted.rowCount) {
    throw new Error('No sample entries were generated. Confirm that active employees exist.');
  }

  const coverage = await client.query(`
    SELECT COUNT(DISTINCT employee.id)::integer AS employees,
           COUNT(DISTINCT (
             employee.id,
             ((attendance.entry->>'timestamp')::timestamptz
               AT TIME ZONE 'Asia/Manila')::date
           ))::integer AS employee_workdays,
           COUNT(DISTINCT (
             attendance.entry->>'userId', attendance.entry->>'timestamp'
           ))::integer AS punches,
           MIN(((attendance.entry->>'timestamp')::timestamptz
             AT TIME ZONE 'Asia/Manila')::date)::text AS first_date,
           MAX(((attendance.entry->>'timestamp')::timestamptz
             AT TIME ZONE 'Asia/Manila')::date)::text AS last_date
    FROM scheduler_backups backup
    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(backup.attendance) attendance(entry)
    JOIN employee_profiles employee
      ON CASE
           WHEN attendance.entry->>'userId' ~ '^[0-9]+$'
            AND employee.employee_number ~ '^[0-9]+$'
           THEN (attendance.entry->>'userId')::numeric = employee.employee_number::numeric
           ELSE attendance.entry->>'userId' = employee.employee_number
         END
    WHERE backup.agent_id = 'paytimepro-sample-aug-sep-2026'
  `);

  await client.query('COMMIT');

  console.log(JSON.stringify({
    status: 'ok',
    period: '2026-08-01 through 2026-09-15',
    previousBackups: existing.rows[0].backups,
    previousPunches: existing.rows[0].punches,
    removedSampleBackups: removedSamples.rowCount,
    clearedBackupRows: cleared.rowCount,
    createdDefaultSchedules: schedules.rowCount,
    ...coverage.rows[0]
  }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  console.error(`Time-entry replacement failed: ${error.message || error}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
