-- Remove the retired Departments module and all persisted department data.
DELETE FROM modules WHERE module_key = 'departments';

DROP TABLE IF EXISTS department_assignments;
DROP TABLE IF EXISTS departments;

DROP INDEX IF EXISTS employee_profiles_department_idx;
ALTER TABLE employee_profiles DROP COLUMN IF EXISTS department;
