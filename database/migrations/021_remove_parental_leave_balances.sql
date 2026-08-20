ALTER TABLE employee_leave_balances
  DROP COLUMN IF EXISTS paternal_leave,
  DROP COLUMN IF EXISTS maternal_leave;
