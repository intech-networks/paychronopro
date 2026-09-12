UPDATE role_permissions permission
SET can_create = TRUE,
    can_view = TRUE,
    can_update = TRUE,
    can_delete = TRUE,
    updated_at = NOW()
FROM roles role, modules module
WHERE permission.role_id = role.id
  AND permission.module_id = module.id
  AND role.name = 'Administrator'
  AND module.is_active = TRUE;
