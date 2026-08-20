ALTER TABLE employee_shift_assignments
  ADD COLUMN IF NOT EXISTS work_days TEXT[] NOT NULL DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday'];

ALTER TABLE employee_shift_assignments
  DROP CONSTRAINT IF EXISTS employee_shift_assignments_work_days_check;

ALTER TABLE employee_shift_assignments
  ADD CONSTRAINT employee_shift_assignments_work_days_check CHECK (
    cardinality(work_days) > 0
    AND work_days <@ ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']::TEXT[]
  );
