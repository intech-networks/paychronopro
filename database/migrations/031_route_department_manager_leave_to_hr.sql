WITH manager_requests AS (
  SELECT leave_request.id,
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
         ) AS hr_approver_id
  FROM employee_leave_requests leave_request
  WHERE leave_request.status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM department_assignments manager_assignment
      WHERE manager_assignment.employee_id = leave_request.employee_id
        AND manager_assignment.assignment_role = 'manager'
    )
)
UPDATE employee_leave_requests leave_request
SET approver_employee_id = manager_request.hr_approver_id,
    routed_at = NOW(),
    updated_at = NOW()
FROM manager_requests manager_request
WHERE leave_request.id = manager_request.id
  AND manager_request.hr_approver_id IS NOT NULL
  AND leave_request.approver_employee_id IS DISTINCT FROM manager_request.hr_approver_id;
