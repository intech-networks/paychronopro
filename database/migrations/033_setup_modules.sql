INSERT INTO modules (module_key, name, description, sort_order) VALUES
  ('setup', 'Setup', 'Parent module for company and organization configuration.', 11),
  ('company', 'Company', 'Company profile and settings.', 12),
  ('organization', 'Organization', 'Organization structure and settings.', 13)
ON CONFLICT (module_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE;

INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
SELECT role.id, module.id, TRUE, TRUE, TRUE, TRUE
FROM roles role
CROSS JOIN modules module
WHERE role.name = 'Administrator'
  AND module.module_key IN ('setup', 'company', 'organization')
ON CONFLICT (role_id, module_id) DO UPDATE SET
  can_create = TRUE,
  can_view = TRUE,
  can_update = TRUE,
  can_delete = TRUE,
  updated_at = NOW();
