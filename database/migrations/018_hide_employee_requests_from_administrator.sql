UPDATE role_permissions permission
SET can_create = FALSE,
    can_view = FALSE,
    can_update = FALSE,
    can_delete = FALSE,
    updated_at = NOW()
FROM roles role, modules module
WHERE permission.role_id = role.id
  AND permission.module_id = module.id
  AND role.name = 'Administrator'
  AND module.module_key IN ('leave_application', 'overtime_request', 'shift_change');
