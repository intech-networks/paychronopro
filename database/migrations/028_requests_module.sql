INSERT INTO modules (module_key, name, description, sort_order) VALUES
  ('requests', 'Requests', 'Review and manage employee time-related requests.', 53)
ON CONFLICT (module_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE;

UPDATE modules
SET sort_order = CASE module_key
  WHEN 'leave_application' THEN 54
  WHEN 'overtime_request' THEN 55
  WHEN 'shift_change' THEN 56
END
WHERE module_key IN ('leave_application', 'overtime_request', 'shift_change');

INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
SELECT parent_permission.role_id, child.id,
       parent_permission.can_create, parent_permission.can_view,
       parent_permission.can_update, parent_permission.can_delete
FROM role_permissions parent_permission
JOIN modules parent ON parent.id = parent_permission.module_id
JOIN modules child ON child.module_key = 'requests'
WHERE parent.module_key = 'time_tracking'
ON CONFLICT (role_id, module_id) DO NOTHING;
