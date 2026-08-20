CREATE TABLE IF NOT EXISTS employee_shift_assignments (
  employee_id BIGINT PRIMARY KEY REFERENCES employee_profiles(id) ON DELETE CASCADE,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('eight_to_five', 'nine_to_six', 'custom')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (start_time < end_time)
);
