ALTER TABLE employee_payroll_profiles
  ADD COLUMN IF NOT EXISTS contribution_deduction_schedule TEXT NOT NULL DEFAULT 'split_evenly'
  CHECK (contribution_deduction_schedule IN ('split_evenly','first_cutoff','second_cutoff'));
