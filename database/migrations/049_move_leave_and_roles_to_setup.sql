INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
SELECT child_permission.role_id, setup.id,
       BOOL_OR(child_permission.can_create), BOOL_OR(child_permission.can_view),
       BOOL_OR(child_permission.can_update), BOOL_OR(child_permission.can_delete)
FROM role_permissions child_permission
JOIN modules child ON child.id = child_permission.module_id
  AND child.module_key IN ('leave_management', 'roles')
JOIN modules setup ON setup.module_key = 'setup'
GROUP BY child_permission.role_id, setup.id
ON CONFLICT (role_id, module_id) DO UPDATE SET
  can_create = role_permissions.can_create OR EXCLUDED.can_create,
  can_view = role_permissions.can_view OR EXCLUDED.can_view,
  can_update = role_permissions.can_update OR EXCLUDED.can_update,
  can_delete = role_permissions.can_delete OR EXCLUDED.can_delete,
  updated_at = NOW();
