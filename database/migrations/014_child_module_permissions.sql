INSERT INTO modules (module_key, name, description, sort_order) VALUES
  ('time_entries', 'Time Entries', 'View employee attendance entries and time records.', 51),
  ('shift_management', 'Shift Management', 'Assign employee shifts and working days.', 52),
  ('device_users', 'Device Users', 'Push and reconcile users on attendance devices.', 61)
ON CONFLICT (module_key) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order, is_active = TRUE;

INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
SELECT parent_permission.role_id, child.id,
       parent_permission.can_create, parent_permission.can_view,
       parent_permission.can_update, parent_permission.can_delete
FROM role_permissions parent_permission
JOIN modules parent ON parent.id = parent_permission.module_id
JOIN (VALUES
  ('time_tracking', 'time_entries'),
  ('time_tracking', 'shift_management'),
  ('scheduler', 'device_users')
) mapping(parent_key, child_key) ON mapping.parent_key = parent.module_key
JOIN modules child ON child.module_key = mapping.child_key
ON CONFLICT (role_id, module_id) DO NOTHING;
