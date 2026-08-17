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
