INSERT INTO modules (module_key, name, description, sort_order) VALUES
  ('leave_management', 'Leave Management', 'Review and manage employee leave records.', 21)
ON CONFLICT (module_key) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order, is_active = TRUE;

INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
SELECT parent_permission.role_id, child.id,
       parent_permission.can_create, parent_permission.can_view,
       parent_permission.can_update, parent_permission.can_delete
FROM role_permissions parent_permission
JOIN modules parent ON parent.id = parent_permission.module_id
JOIN modules child ON child.module_key = 'leave_management'
WHERE parent.module_key = 'maintenance'
ON CONFLICT (role_id, module_id) DO NOTHING;
