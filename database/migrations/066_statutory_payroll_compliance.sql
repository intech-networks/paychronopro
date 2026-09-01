ALTER TABLE employee_payroll_profiles
  ADD COLUMN IF NOT EXISTS monthly_contribution_base NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS minimum_wage_region TEXT,
  ADD COLUMN IF NOT EXISTS minimum_daily_wage NUMERIC(14,2);

ALTER TABLE employee_payroll_profiles
  DROP CONSTRAINT IF EXISTS employee_payroll_profiles_monthly_contribution_base_check,
  DROP CONSTRAINT IF EXISTS employee_payroll_profiles_minimum_daily_wage_check;

ALTER TABLE employee_payroll_profiles
  ADD CONSTRAINT employee_payroll_profiles_monthly_contribution_base_check
    CHECK (monthly_contribution_base IS NULL OR monthly_contribution_base > 0),
  ADD CONSTRAINT employee_payroll_profiles_minimum_daily_wage_check
    CHECK (minimum_daily_wage IS NULL OR minimum_daily_wage > 0);

UPDATE employee_payroll_profiles
SET monthly_contribution_base = base_rate
WHERE pay_basis = 'monthly' AND monthly_contribution_base IS NULL AND base_rate > 0;

ALTER TABLE employee_payroll_components
  ADD COLUMN IF NOT EXISTS benefit_category TEXT;

ALTER TABLE employee_payroll_components
  DROP CONSTRAINT IF EXISTS employee_payroll_components_benefit_category_check;

ALTER TABLE employee_payroll_components
  ADD CONSTRAINT employee_payroll_components_benefit_category_check
  CHECK (benefit_category IS NULL OR benefit_category IN (
    'medical_dependents', 'rice', 'uniform', 'medical_assistance', 'laundry',
    'achievement_award', 'christmas_gifts', 'cba_productivity', 'overtime_meal',
    'thirteenth_month'
  ));

ALTER TABLE payroll_run_items
  ADD COLUMN IF NOT EXISTS sss_employer NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sss_ec_employer NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS philhealth_employer NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pagibig_employer NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_refund NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE payroll_run_items
  ADD CONSTRAINT payroll_run_items_employer_contributions_nonnegative_check
  CHECK (
    sss_employer >= 0
    AND sss_ec_employer >= 0
    AND philhealth_employer >= 0
    AND pagibig_employer >= 0
    AND tax_refund >= 0
  ) NOT VALID;

ALTER TABLE payroll_run_items
  VALIDATE CONSTRAINT payroll_run_items_employer_contributions_nonnegative_check;

ALTER TABLE payroll_run_items
  DROP CONSTRAINT IF EXISTS payroll_run_items_nonnegative_check;

ALTER TABLE payroll_run_items
  ADD CONSTRAINT payroll_run_items_nonnegative_check
  CHECK (
    gross_compensation >= 0
    AND taxable_compensation >= 0
    AND non_taxable_compensation >= 0
    AND sss_employee >= 0
    AND philhealth_employee >= 0
    AND pagibig_employee >= 0
    AND union_dues >= 0
    AND tax_withheld >= 0
    AND net_pay >= 0
  ) NOT VALID;

ALTER TABLE payroll_run_items
  VALIDATE CONSTRAINT payroll_run_items_nonnegative_check;
