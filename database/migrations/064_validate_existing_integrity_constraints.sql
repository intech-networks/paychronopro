DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM company_holidays
    WHERE end_date IS NOT NULL
      AND end_date - start_date > 365
  ) THEN
    ALTER TABLE company_holidays
      VALIDATE CONSTRAINT company_holidays_maximum_span_check;
  ELSE
    RAISE WARNING 'company_holidays_maximum_span_check remains NOT VALID because legacy rows exceed 365 days.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM company_events
    WHERE end_date IS NOT NULL
      AND end_date - start_date > 365
  ) THEN
    ALTER TABLE company_events
      VALIDATE CONSTRAINT company_events_maximum_span_check;
  ELSE
    RAISE WARNING 'company_events_maximum_span_check remains NOT VALID because legacy rows exceed 365 days.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM payroll_run_items
    WHERE gross_compensation < 0
       OR taxable_compensation < 0
       OR non_taxable_compensation < 0
       OR sss_employee < 0
       OR philhealth_employee < 0
       OR pagibig_employee < 0
       OR union_dues < 0
       OR tax_withheld < 0
       OR net_pay < 0
       OR net_pay > gross_compensation
  ) THEN
    ALTER TABLE payroll_run_items
      VALIDATE CONSTRAINT payroll_run_items_nonnegative_check;
  ELSE
    RAISE WARNING 'payroll_run_items_nonnegative_check remains NOT VALID because legacy payroll rows violate its totals.';
  END IF;
END;
$$;
