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
    AND net_pay <= gross_compensation
  ) NOT VALID;
