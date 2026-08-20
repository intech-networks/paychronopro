UPDATE role_permissions permission
SET can_update = TRUE, updated_at = NOW()
FROM roles role, modules module
WHERE permission.role_id = role.id
  AND permission.module_id = module.id
  AND role.name = 'Employee'
  AND module.module_key IN ('time_tracking', 'leave_application');
