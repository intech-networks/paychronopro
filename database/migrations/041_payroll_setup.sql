INSERT INTO modules (module_key, name, description, sort_order) VALUES
  ('payroll_setup', 'Setup', 'Configure employee compensation, earnings, and deductions.', 71)
ON CONFLICT (module_key) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, sort_order=EXCLUDED.sort_order, is_active=TRUE;

INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
SELECT role.id, module.id, TRUE, TRUE, TRUE, TRUE
FROM roles role CROSS JOIN modules module
WHERE role.name='Administrator' AND module.module_key='payroll_setup'
ON CONFLICT (role_id, module_id) DO UPDATE SET can_create=TRUE, can_view=TRUE, can_update=TRUE, can_delete=TRUE, updated_at=NOW();

CREATE TABLE IF NOT EXISTS employee_payroll_profiles (
  employee_id BIGINT PRIMARY KEY REFERENCES employee_profiles(id) ON DELETE CASCADE,
  pay_basis TEXT NOT NULL DEFAULT 'monthly' CHECK (pay_basis IN ('monthly','daily','hourly')),
  pay_frequency TEXT NOT NULL DEFAULT 'semi_monthly' CHECK (pay_frequency IN ('weekly','biweekly','semi_monthly','monthly')),
  base_rate NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (base_rate >= 0),
  standard_hours_per_day NUMERIC(4,2) NOT NULL DEFAULT 8 CHECK (standard_hours_per_day > 0 AND standard_hours_per_day <= 24),
  tax_status TEXT NOT NULL DEFAULT 'taxable' CHECK (tax_status IN ('taxable','exempt')),
  effective_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_payroll_components (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL CHECK (component_type IN ('earning','deduction')),
  name TEXT NOT NULL CHECK (LENGTH(TRIM(name)) BETWEEN 1 AND 100),
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  calculation TEXT NOT NULL DEFAULT 'fixed' CHECK (calculation IN ('fixed','percentage')),
  is_taxable BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employee_payroll_components_employee_idx ON employee_payroll_components(employee_id);
