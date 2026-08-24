DROP INDEX IF EXISTS organization_assignments_one_current_idx;

CREATE UNIQUE INDEX IF NOT EXISTS organization_assignments_one_current_unit_idx
  ON organization_assignments (employee_id, unit_id)
  WHERE effective_to IS NULL;

CREATE TABLE IF NOT EXISTS organization_assignment_managers (
  assignment_id BIGINT NOT NULL REFERENCES organization_assignments(id) ON DELETE CASCADE,
  manager_employee_id BIGINT NOT NULL REFERENCES employee_profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (assignment_id, manager_employee_id)
);

CREATE INDEX IF NOT EXISTS organization_assignment_managers_manager_idx
  ON organization_assignment_managers (manager_employee_id);

INSERT INTO organization_assignment_managers (assignment_id, manager_employee_id)
SELECT assignment.id, assignment.manager_employee_id
FROM organization_assignments assignment
WHERE assignment.manager_employee_id IS NOT NULL
ON CONFLICT DO NOTHING;
