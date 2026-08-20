INSERT INTO roles (name, description, is_system)
VALUES ('HR Manager', 'Reviews employee requests and manages human resources workflows.', TRUE)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  is_system = TRUE,
  updated_at = NOW();

INSERT INTO role_permissions (role_id, module_id, can_view, can_update)
SELECT role.id, module.id, TRUE, TRUE
FROM roles role CROSS JOIN modules module
WHERE role.name = 'HR Manager'
  AND module.module_key IN ('time_tracking', 'leave_application')
ON CONFLICT (role_id, module_id) DO UPDATE SET
  can_view = TRUE,
  can_update = TRUE,
  updated_at = NOW();
