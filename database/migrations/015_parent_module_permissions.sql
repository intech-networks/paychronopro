INSERT INTO modules (module_key, name, description, sort_order) VALUES
  ('maintenance', 'Maintenance', 'Parent module for workforce administration.', 15),
  ('utilities', 'Utilities', 'Parent module for device and synchronization utilities.', 55)
ON CONFLICT (module_key) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order, is_active = TRUE;

INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
SELECT child_permission.role_id, parent.id,
       BOOL_OR(child_permission.can_create), BOOL_OR(child_permission.can_view),
       BOOL_OR(child_permission.can_update), BOOL_OR(child_permission.can_delete)
FROM role_permissions child_permission
JOIN modules child ON child.id = child_permission.module_id
JOIN (VALUES
  ('maintenance', 'workforce'),
  ('maintenance', 'departments'),
  ('maintenance', 'roles'),
  ('utilities', 'scheduler'),
  ('utilities', 'device_users')
) mapping(parent_key, child_key) ON mapping.child_key = child.module_key
JOIN modules parent ON parent.module_key = mapping.parent_key
GROUP BY child_permission.role_id, parent.id
ON CONFLICT (role_id, module_id) DO NOTHING;
