ALTER TABLE payroll_run_items
  ADD COLUMN IF NOT EXISTS disbursement_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS disbursement_method TEXT,
  ADD COLUMN IF NOT EXISTS disbursement_reference TEXT,
  ADD COLUMN IF NOT EXISTS disbursement_notes TEXT,
  ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disbursed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE payroll_run_items
  DROP CONSTRAINT IF EXISTS payroll_run_items_disbursement_status_check,
  DROP CONSTRAINT IF EXISTS payroll_run_items_disbursement_method_check;

ALTER TABLE payroll_run_items
  ADD CONSTRAINT payroll_run_items_disbursement_status_check
    CHECK (disbursement_status IN ('pending', 'processing', 'paid', 'failed')),
  ADD CONSTRAINT payroll_run_items_disbursement_method_check
    CHECK (disbursement_method IS NULL OR disbursement_method IN (
      'bank_transfer', 'cash', 'check', 'e_wallet'
    ));

CREATE INDEX IF NOT EXISTS payroll_run_items_disbursement_idx
  ON payroll_run_items(run_id, disbursement_status);

INSERT INTO modules (module_key, name, description, sort_order)
VALUES ('disbursement', 'Disbursement', 'Track employee payroll payment processing and release.', 74)
ON CONFLICT (module_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE;

INSERT INTO role_permissions (
  role_id, module_id, can_create, can_view, can_update, can_delete
)
SELECT role.id, module.id, TRUE, TRUE, TRUE, TRUE
FROM roles role
JOIN modules module ON module.module_key = 'disbursement'
WHERE role.name = 'Administrator'
ON CONFLICT (role_id, module_id) DO UPDATE SET
  can_create = TRUE,
  can_view = TRUE,
  can_update = TRUE,
  can_delete = TRUE,
  updated_at = NOW();
