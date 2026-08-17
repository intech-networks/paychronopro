INSERT INTO departments (name, description)
SELECT DISTINCT TRIM(department), 'Imported from existing employee profiles.'
FROM employee_profiles
WHERE TRIM(department) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO department_assignments (department_id, employee_id, assignment_role)
SELECT d.id, ep.id, 'member'
FROM employee_profiles ep
JOIN departments d ON d.name = TRIM(ep.department)
WHERE TRIM(ep.department) <> ''
ON CONFLICT (employee_id) DO NOTHING;
