CREATE TABLE IF NOT EXISTS employee_leave_balances (
  employee_id BIGINT PRIMARY KEY REFERENCES employee_profiles(id) ON DELETE CASCADE,
  vacation_leave NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (vacation_leave BETWEEN 0 AND 999),
  sick_leave NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (sick_leave BETWEEN 0 AND 999),
  paternal_leave NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (paternal_leave BETWEEN 0 AND 999),
  maternal_leave NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (maternal_leave BETWEEN 0 AND 999),
  emergency_leave NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (emergency_leave BETWEEN 0 AND 999),
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
