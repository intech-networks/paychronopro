INSERT INTO modules (module_key, name, description, sort_order) VALUES
  ('exemption_report', 'Exemption Report', 'Monthly consolidated daily time-entry exemptions.', 52)
ON CONFLICT (module_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE;

INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
SELECT source.role_id, report.id,
       FALSE, source.can_view, FALSE, FALSE
FROM role_permissions source
JOIN roles role ON role.id = source.role_id AND role.name <> 'Employee'
JOIN modules time_entries ON time_entries.id = source.module_id AND time_entries.module_key = 'time_entries'
JOIN modules report ON report.module_key = 'exemption_report'
ON CONFLICT (role_id, module_id) DO UPDATE SET
  can_view = role_permissions.can_view OR EXCLUDED.can_view,
  updated_at = NOW();
