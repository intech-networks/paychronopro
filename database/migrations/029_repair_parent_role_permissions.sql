INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
SELECT child_permission.role_id, parent.id,
       BOOL_OR(child_permission.can_create), BOOL_OR(child_permission.can_view),
       BOOL_OR(child_permission.can_update), BOOL_OR(child_permission.can_delete)
FROM role_permissions child_permission
JOIN modules child ON child.id = child_permission.module_id
JOIN (VALUES
  ('maintenance', 'workforce'),
  ('maintenance', 'leave_management'),
  ('maintenance', 'departments'),
  ('maintenance', 'roles'),
  ('time_tracking', 'time_entries'),
  ('time_tracking', 'shift_management'),
  ('time_tracking', 'requests'),
  ('time_tracking', 'leave_application'),
  ('time_tracking', 'overtime_request'),
  ('time_tracking', 'shift_change'),
  ('utilities', 'scheduler'),
  ('utilities', 'device_users')
) mapping(parent_key, child_key) ON mapping.child_key = child.module_key
JOIN modules parent ON parent.module_key = mapping.parent_key
GROUP BY child_permission.role_id, parent.id
ON CONFLICT (role_id, module_id) DO UPDATE SET
  can_create = role_permissions.can_create OR EXCLUDED.can_create,
  can_view = role_permissions.can_view OR EXCLUDED.can_view,
  can_update = role_permissions.can_update OR EXCLUDED.can_update,
  can_delete = role_permissions.can_delete OR EXCLUDED.can_delete,
  updated_at = NOW();
