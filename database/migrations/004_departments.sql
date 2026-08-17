CREATE TABLE IF NOT EXISTS departments (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS department_assignments (
  department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL UNIQUE REFERENCES employee_profiles(id) ON DELETE CASCADE,
  assignment_role TEXT NOT NULL CHECK (assignment_role IN ('manager', 'assistant_manager', 'member')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (department_id, employee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS department_one_manager_idx
  ON department_assignments (department_id)
  WHERE assignment_role = 'manager';

CREATE UNIQUE INDEX IF NOT EXISTS department_one_assistant_manager_idx
  ON department_assignments (department_id)
  WHERE assignment_role = 'assistant_manager';

CREATE INDEX IF NOT EXISTS department_assignments_department_idx
  ON department_assignments (department_id, assignment_role);
