import { pool } from '../src/db/pool.js';

try {
  const integrity = (await pool.query(`
    SELECT
      current_schema() AS schema,
      (SELECT COUNT(*)::integer FROM schema_migrations) AS migrations,
      (SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1) AS latest_migration,
      (SELECT COUNT(*)::integer
       FROM pg_constraint
       WHERE connamespace=current_schema()::regnamespace
         AND contype='f' AND NOT convalidated) AS unvalidated_foreign_keys,
      (SELECT COUNT(*)::integer
       FROM pg_constraint
       WHERE connamespace=current_schema()::regnamespace
         AND contype='c' AND NOT convalidated) AS unvalidated_integrity_checks,
      (SELECT COUNT(*)::integer
       FROM employee_profiles employee
       LEFT JOIN users account ON account.id=employee.user_id
       WHERE employee.user_id IS NOT NULL AND account.id IS NULL) AS orphan_employee_accounts,
      (SELECT COUNT(*)::integer
       FROM organization_assignments assignment
       LEFT JOIN employee_profiles employee ON employee.id=assignment.employee_id
       WHERE employee.id IS NULL) AS orphan_assignments,
      (SELECT COUNT(*)::integer
       FROM employee_profiles employee
       JOIN users account ON account.id=employee.user_id
       WHERE employee.employment_status='inactive' AND account.is_active=TRUE)
        AS inactive_employees_with_active_login,
      (SELECT COUNT(*)::integer
       FROM (
         SELECT employee_id, unit_id
         FROM organization_assignments
         WHERE effective_to IS NULL
         GROUP BY employee_id, unit_id
         HAVING COUNT(*)>1
       ) duplicate) AS duplicate_current_assignments,
      (SELECT COUNT(*)::integer
       FROM payroll_run_items item
       LEFT JOIN payroll_runs run ON run.id=item.run_id
       LEFT JOIN employee_profiles employee ON employee.id=item.employee_id
       WHERE run.id IS NULL OR employee.id IS NULL) AS orphan_payroll_items,
      (SELECT COUNT(*)::integer
       FROM payroll_run_items
       WHERE taxable_compensation + non_taxable_compensation > gross_compensation)
        AS invalid_payroll_items,
      (SELECT COUNT(*)::integer
       FROM (
         SELECT DISTINCT earlier.id, later.id, earlier_item.employee_id
         FROM payroll_runs earlier
         JOIN payroll_run_items earlier_item ON earlier_item.run_id=earlier.id
         JOIN payroll_runs later ON later.id>earlier.id AND later.status='finalized'
         JOIN payroll_run_items later_item ON later_item.run_id=later.id
           AND later_item.employee_id=earlier_item.employee_id
         WHERE earlier.status='finalized'
           AND daterange(earlier.period_start, earlier.period_end, '[]')
             && daterange(later.period_start, later.period_end, '[]')
       ) conflict) AS overlapping_finalized_payroll_items,
      (SELECT COUNT(*)::integer
       FROM tax_configurations earlier
       JOIN tax_configurations later ON later.id>earlier.id
         AND later.pay_frequency=earlier.pay_frequency
       WHERE earlier.is_active=TRUE AND later.is_active=TRUE
         AND daterange(
           earlier.effective_from,
           COALESCE(earlier.effective_to, 'infinity'::date),
           '[]'
         ) && daterange(
           later.effective_from,
           COALESCE(later.effective_to, 'infinity'::date),
           '[]'
         )) AS overlapping_active_tax_configurations,
      (SELECT COUNT(*)::integer FROM employee_profiles) AS employees,
      (SELECT COUNT(*)::integer FROM employee_profiles WHERE employment_status='active')
        AS active_employees,
      (SELECT COUNT(*)::integer FROM organization_assignments
       WHERE effective_to IS NULL) AS current_assignments,
      (SELECT COUNT(*)::integer FROM employee_payroll_profiles) AS payroll_profiles,
      (SELECT COUNT(*)::integer FROM employee_shift_assignments) AS shift_assignments,
      (SELECT COUNT(*)::integer FROM payroll_runs) AS payroll_runs
  `)).rows[0];

  const legacyRelations = (await pool.query(`
    SELECT to_regclass('public.users') IS NOT NULL AS users,
           to_regclass('public.roles') IS NOT NULL AS roles
  `)).rows[0];
  let legacyPublicUsers = 0;
  let legacyPublicRoles = 0;
  if (legacyRelations.users) {
    legacyPublicUsers = Number((await pool.query('SELECT COUNT(*) FROM public.users')).rows[0].count);
  }
  if (legacyRelations.roles) {
    legacyPublicRoles = Number((await pool.query('SELECT COUNT(*) FROM public.roles')).rows[0].count);
  }

  const errorKeys = [
    'unvalidated_foreign_keys',
    'unvalidated_integrity_checks',
    'orphan_employee_accounts',
    'orphan_assignments',
    'inactive_employees_with_active_login',
    'duplicate_current_assignments',
    'orphan_payroll_items',
    'invalid_payroll_items',
    'overlapping_finalized_payroll_items',
    'overlapping_active_tax_configurations'
  ];
  const failedChecks = errorKeys.filter((key) => Number(integrity[key]) !== 0);
  const result = {
    status:failedChecks.length ? 'error' : 'ok',
    ...integrity,
    legacy_public_users:legacyPublicUsers,
    legacy_public_roles:legacyPublicRoles,
    failed_checks:failedChecks
  };
  console.log(JSON.stringify(result, null, 2));
  if (failedChecks.length) process.exitCode = 1;
} catch (error) {
  console.error(`Database audit failed: ${error.message || error}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
