ALTER TABLE employee_leave_requests
  ADD COLUMN IF NOT EXISTS credits_deducted BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE employee_leave_requests
SET credits_deducted = TRUE
WHERE status = 'approved';
