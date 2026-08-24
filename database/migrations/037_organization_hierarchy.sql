ALTER TABLE organization_departments
  ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES organization_departments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS unit_type TEXT NOT NULL DEFAULT 'department';

ALTER TABLE organization_departments
  DROP CONSTRAINT IF EXISTS organization_departments_unit_type_check;
ALTER TABLE organization_departments
  ADD CONSTRAINT organization_departments_unit_type_check
  CHECK (unit_type IN ('department', 'team'));

CREATE INDEX IF NOT EXISTS organization_departments_parent_idx
  ON organization_departments (parent_id);

ALTER TABLE organization_positions
  ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;

WITH position_scale AS (
  SELECT COALESCE(MAX(sort_order), 1) AS maximum FROM organization_positions
)
UPDATE organization_positions position
SET level = position_scale.maximum + 1 - position.sort_order
FROM position_scale
WHERE position.sort_order > 0;

ALTER TABLE organization_positions
  DROP CONSTRAINT IF EXISTS organization_positions_level_check;
ALTER TABLE organization_positions
  ADD CONSTRAINT organization_positions_level_check CHECK (level BETWEEN 1 AND 100);

CREATE TABLE IF NOT EXISTS organization_assignments (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  unit_id BIGINT NOT NULL REFERENCES organization_departments(id) ON DELETE RESTRICT,
  position_id BIGINT NOT NULL REFERENCES organization_positions(id) ON DELETE RESTRICT,
  manager_employee_id BIGINT REFERENCES employee_profiles(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (manager_employee_id IS NULL OR manager_employee_id <> employee_id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS organization_assignments_unit_idx
  ON organization_assignments (unit_id) WHERE effective_to IS NULL;
CREATE INDEX IF NOT EXISTS organization_assignments_manager_idx
  ON organization_assignments (manager_employee_id) WHERE effective_to IS NULL;

INSERT INTO organization_assignments (employee_id, unit_id, position_id, effective_from)
SELECT employee.id, unit.id, position.id, COALESCE(employee.hire_date, CURRENT_DATE)
FROM employee_profiles employee
JOIN organization_departments unit ON LOWER(unit.name) = LOWER(NULLIF(TRIM(employee.department), ''))
JOIN organization_positions position ON LOWER(position.name) = LOWER(NULLIF(TRIM(employee.job_title), ''))
WHERE NOT EXISTS (
  SELECT 1 FROM organization_assignments assignment
  WHERE assignment.employee_id = employee.id AND assignment.effective_to IS NULL
);
