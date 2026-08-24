CREATE TABLE IF NOT EXISTS organization_departments (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organization_departments_name_idx
  ON organization_departments (name);

INSERT INTO organization_departments (name) VALUES
  ('Executive Management'),
  ('Human Resources'),
  ('Finance and Accounting'),
  ('Operations'),
  ('Information Technology'),
  ('Sales'),
  ('Marketing'),
  ('Customer Service')
ON CONFLICT (name) DO NOTHING;
