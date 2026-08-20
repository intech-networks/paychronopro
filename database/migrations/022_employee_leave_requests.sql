CREATE TABLE IF NOT EXISTS employee_leave_requests (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('vacation', 'sick', 'emergency')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  requested_days NUMERIC(6,2) NOT NULL CHECK (requested_days > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_leave_requests_pending_unique
  ON employee_leave_requests (employee_id, leave_type, start_date, end_date)
  WHERE status = 'pending';

UPDATE role_permissions permission
SET can_create = TRUE, updated_at = NOW()
FROM roles role, modules module
WHERE permission.role_id = role.id
  AND permission.module_id = module.id
  AND role.name = 'Employee'
  AND module.module_key IN ('time_tracking', 'leave_application');
