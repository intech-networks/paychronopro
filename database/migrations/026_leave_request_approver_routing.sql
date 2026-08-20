ALTER TABLE employee_leave_requests
  ADD COLUMN IF NOT EXISTS approver_employee_id BIGINT REFERENCES employee_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS employee_leave_requests_approver_idx
  ON employee_leave_requests (approver_employee_id, status, created_at DESC);

UPDATE employee_leave_requests leave_request
SET approver_employee_id = COALESCE(
      (
        SELECT manager.id
        FROM department_assignments requester_assignment
        JOIN department_assignments manager_assignment
          ON manager_assignment.department_id = requester_assignment.department_id
         AND manager_assignment.assignment_role = 'manager'
        JOIN employee_profiles manager ON manager.id = manager_assignment.employee_id
        JOIN users manager_user ON manager_user.id = manager.user_id AND manager_user.is_active = TRUE
        WHERE requester_assignment.employee_id = leave_request.employee_id
          AND manager.id <> leave_request.employee_id
          AND manager.employment_status = 'active'
        ORDER BY manager.id LIMIT 1
      ),
      (
        SELECT hr_employee.id
        FROM employee_profiles hr_employee
        JOIN users hr_user ON hr_user.id = hr_employee.user_id AND hr_user.is_active = TRUE
        JOIN roles hr_role ON hr_role.id = hr_user.role_id
        WHERE LOWER(hr_role.name) = LOWER('HR Manager')
          AND hr_employee.employment_status = 'active'
          AND hr_employee.id <> leave_request.employee_id
        ORDER BY hr_employee.last_name, hr_employee.first_name, hr_employee.id
        LIMIT 1
      )
    ),
    routed_at = NOW()
WHERE leave_request.status = 'pending'
  AND leave_request.approver_employee_id IS NULL;

INSERT INTO role_permissions (role_id, module_id, can_view, can_update)
SELECT role.id, module.id, TRUE, TRUE
FROM roles role CROSS JOIN modules module
WHERE LOWER(role.name) = LOWER('HR Manager')
  AND module.module_key IN ('time_tracking', 'leave_application')
ON CONFLICT (role_id, module_id) DO UPDATE SET
  can_view = TRUE, can_update = TRUE, updated_at = NOW();
