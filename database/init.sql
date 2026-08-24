CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('administrator', 'user')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modules (
  id BIGSERIAL PRIMARY KEY,
  module_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id BIGINT REFERENCES roles(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module_id BIGINT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  can_create BOOLEAN NOT NULL DEFAULT FALSE,
  can_view BOOLEAN NOT NULL DEFAULT FALSE,
  can_update BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, module_id)
);

CREATE INDEX IF NOT EXISTS users_role_id_idx ON users (role_id);

CREATE OR REPLACE FUNCTION enforce_system_administrator_role()
RETURNS TRIGGER AS $$
DECLARE
  administrator_role_id BIGINT;
BEGIN
  SELECT id INTO administrator_role_id FROM roles WHERE name = 'Administrator';

  IF TG_OP = 'UPDATE' AND OLD.is_system = TRUE AND NEW.is_system = FALSE THEN
    RAISE EXCEPTION 'The system Administrator account cannot be unprotected.';
  END IF;

  IF NEW.is_system = TRUE AND NEW.role_id IS DISTINCT FROM administrator_role_id THEN
    RAISE EXCEPTION 'The system Administrator account must have the Administrator role.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_enforce_system_administrator_role ON users;
CREATE TRIGGER users_enforce_system_administrator_role
BEFORE INSERT OR UPDATE OF role_id, is_system ON users
FOR EACH ROW EXECUTE FUNCTION enforce_system_administrator_role();

CREATE TABLE IF NOT EXISTS employee_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  employee_number TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  job_title TEXT NOT NULL DEFAULT '',
  hire_date DATE,
  employment_status TEXT NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE employee_profiles
  ADD COLUMN IF NOT EXISTS user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE employee_profiles
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_contact_alternate_phone TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS employee_documents (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  storage_name TEXT NOT NULL UNIQUE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employee_documents_employee_id_idx
  ON employee_documents (employee_id, uploaded_at);

CREATE INDEX IF NOT EXISTS employee_profiles_name_idx
  ON employee_profiles (last_name, first_name);
CREATE TABLE IF NOT EXISTS employee_shift_assignments (
  employee_id BIGINT PRIMARY KEY REFERENCES employee_profiles(id) ON DELETE CASCADE,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('eight_to_five', 'nine_to_six', 'custom')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  work_days TEXT[] NOT NULL DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday'],
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (start_time < end_time)
);

ALTER TABLE employee_shift_assignments
  ADD COLUMN IF NOT EXISTS work_days TEXT[] NOT NULL DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday'];

ALTER TABLE employee_shift_assignments
  DROP CONSTRAINT IF EXISTS employee_shift_assignments_work_days_check;
ALTER TABLE employee_shift_assignments
  ADD CONSTRAINT employee_shift_assignments_work_days_check CHECK (
    cardinality(work_days) > 0
    AND work_days <@ ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']::TEXT[]
  );

UPDATE employee_profiles
SET employment_status = 'inactive', updated_at = NOW()
WHERE employment_status NOT IN ('active', 'inactive');

ALTER TABLE employee_profiles
  DROP CONSTRAINT IF EXISTS employee_profiles_employment_status_check;
ALTER TABLE employee_profiles
  ADD CONSTRAINT employee_profiles_employment_status_check
  CHECK (employment_status IN ('active', 'inactive'));
