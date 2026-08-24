INSERT INTO modules (module_key, name, description, sort_order) VALUES
  ('workforce_module', 'Workforce', 'Parent module for employee records and workforce information.', 14)
ON CONFLICT (module_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE;

INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
SELECT employee_permission.role_id, workforce_parent.id,
       employee_permission.can_create, employee_permission.can_view,
       employee_permission.can_update, employee_permission.can_delete
FROM role_permissions employee_permission
JOIN modules employees ON employees.id = employee_permission.module_id AND employees.module_key = 'workforce'
JOIN modules workforce_parent ON workforce_parent.module_key = 'workforce_module'
ON CONFLICT (role_id, module_id) DO UPDATE SET
  can_create = role_permissions.can_create OR EXCLUDED.can_create,
  can_view = role_permissions.can_view OR EXCLUDED.can_view,
  can_update = role_permissions.can_update OR EXCLUDED.can_update,
  can_delete = role_permissions.can_delete OR EXCLUDED.can_delete,
  updated_at = NOW();
