ALTER TABLE payroll_run_items
  ADD CONSTRAINT payroll_run_items_compensation_totals_check
  CHECK (taxable_compensation + non_taxable_compensation <= gross_compensation)
  NOT VALID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM payroll_run_items
    WHERE taxable_compensation + non_taxable_compensation > gross_compensation
  ) THEN
    ALTER TABLE payroll_run_items
      VALIDATE CONSTRAINT payroll_run_items_compensation_totals_check;
  ELSE
    RAISE WARNING 'payroll_run_items_compensation_totals_check remains NOT VALID because legacy payroll rows violate its totals.';
  END IF;
END;
$$;
