INSERT INTO modules (module_key, name, description, sort_order) VALUES
  ('leave_application', 'Leave Application', 'Submit and review employee leave applications.', 53),
  ('overtime_request', 'Overtime Request', 'Submit and review employee overtime requests.', 54)
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
  ('time_tracking', 'leave_application'),
  ('time_tracking', 'overtime_request')
) mapping(parent_key, child_key) ON mapping.parent_key = parent.module_key
JOIN modules child ON child.module_key = mapping.child_key
ON CONFLICT (role_id, module_id) DO NOTHING;
