UPDATE employee_leave_requests leave_request
SET approver_employee_id = direct_manager.manager_employee_id,
    routed_at = CASE WHEN direct_manager.manager_employee_id IS NULL THEN NULL ELSE NOW() END,
    updated_at = NOW()
FROM (
  SELECT employee.id AS employee_id,
         CASE WHEN manager.id IS NOT NULL AND manager_user.is_active = TRUE
                   AND manager.employment_status = 'active'
              THEN assignment.manager_employee_id ELSE NULL END AS manager_employee_id
  FROM employee_profiles employee
  LEFT JOIN organization_assignments assignment
    ON assignment.employee_id = employee.id AND assignment.effective_to IS NULL
  LEFT JOIN employee_profiles manager ON manager.id = assignment.manager_employee_id
  LEFT JOIN users manager_user ON manager_user.id = manager.user_id
) direct_manager
WHERE leave_request.employee_id = direct_manager.employee_id
  AND leave_request.status = 'pending'
  AND leave_request.approver_employee_id IS DISTINCT FROM direct_manager.manager_employee_id;
