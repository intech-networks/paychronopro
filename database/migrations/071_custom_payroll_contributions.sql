ALTER TABLE employee_payroll_components
  DROP CONSTRAINT IF EXISTS employee_payroll_components_component_type_check;

ALTER TABLE employee_payroll_components
  ADD CONSTRAINT employee_payroll_components_component_type_check
  CHECK (component_type IN ('earning', 'deduction', 'contribution'));
