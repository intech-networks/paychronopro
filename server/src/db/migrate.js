import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { config, databaseSchemaIdentifier } from '../config.js';

const migrationPath = fileURLToPath(new URL('../../../database/init.sql', import.meta.url));
const migrationsDirectory = fileURLToPath(new URL('../../../database/migrations', import.meta.url));
const demoDataMigrationFiles = new Set([
  '051_seed_dummy_time_entry_exceptions.sql',
  '052_refresh_dummy_time_entry_patterns.sql',
  '056_seed_valid_employee_time_entries.sql',
  '057_seed_valid_time_entries_august_1_15_2026.sql'
]);

try {
  if (config.isProduction && config.adminPassword === 'ChangeMe123!') {
    throw new Error('ADMIN_PASSWORD must be changed before running production migrations.');
  }
  if (!process.env.DATABASE_SCHEMA && config.databaseSchema === 'paytimepro') {
    const legacySchema = await pool.query(
      `SELECT COUNT(*)::integer AS table_count
       FROM information_schema.tables
       WHERE table_schema='public'
         AND table_name=ANY($1::text[])`,
      [['users', 'roles', 'modules', 'role_permissions', 'employee_profiles']]
    );
    if (Number(legacySchema.rows[0].table_count) === 5) {
      throw new Error('Existing PayTimePro data was found in the public schema. Set DATABASE_SCHEMA=public to keep using it, or choose an explicit data-migration plan before initializing the paytimepro schema.');
    }
  }
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${databaseSchemaIdentifier}`);
  const sql = await readFile(migrationPath, 'utf8');
  await pool.query(sql);
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const migrationFiles = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of migrationFiles) {
    const alreadyApplied = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
    if (alreadyApplied.rowCount) continue;
    if (demoDataMigrationFiles.has(file) && !config.seedDemoData) {
      await pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      console.log(`Skipped demo data migration: ${file}`);
      continue;
    }
    const migrationSql = await readFile(new URL(`../../../database/migrations/${file}`, import.meta.url), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migrationSql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  await pool.query(
    `INSERT INTO roles (name, description, is_system) VALUES
       ('Administrator', 'Full access to every module and operation.', TRUE),
       ('Employee', 'Standard employee self-service access.', TRUE),
       ('HR Manager', 'Reviews employee requests and manages human resources workflows.', TRUE)
     ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, is_system = TRUE`
  );
  await pool.query(
    `INSERT INTO modules (module_key, name, description, sort_order) VALUES
       ('overview', 'Overview', 'Dashboard overview and personal summary.', 10),
       ('setup', 'Setup', 'Parent module for company and organization configuration.', 11),
       ('company', 'Company', 'Company profile and settings.', 12),
       ('site_settings', 'Site Settings', 'Manage site identity, logo, and application colors.', 12),
       ('organization', 'Organization', 'Organization structure and settings.', 13),
       ('workforce_module', 'Workforce', 'Parent module for employee records and workforce information.', 14),
       ('tax_configuration', 'Tax Configuration', 'Configure Philippine salary tax withholding rules.', 72),
       ('maintenance', 'Maintenance', 'Parent module for workforce administration.', 15),
       ('workforce', 'Employees', 'Employee profiles and workforce records.', 20),
       ('leave_management', 'Leave Management', 'Review and manage employee leave records.', 21),
       ('roles', 'Roles & Access', 'Roles and module operation permissions.', 40),
       ('calendar', 'Calendar', 'Company holidays and events.', 45),
       ('time_tracking', 'Timetracking', 'Time entries, clock-ins, and timesheets.', 50),
       ('time_entries', 'Time Entries', 'View employee attendance entries and time records.', 51),
       ('exemption_report', 'Exemption Report', 'Monthly consolidated daily time-entry exemptions.', 52),
       ('shift_management', 'Shift Management', 'Assign employee shifts and working days.', 52),
       ('requests', 'Requests', 'Review and manage employee time-related requests.', 53),
       ('leave_application', 'Leave Application', 'Submit and review employee leave applications.', 54),
       ('overtime_request', 'Overtime Request', 'Submit and review employee overtime requests.', 55),
       ('shift_change', 'Shift Change', 'Submit and review employee shift change requests.', 56),
       ('utilities', 'Utilities', 'Parent module for device and synchronization utilities.', 55),
       ('scheduler', 'Sync Agent', 'Synchronizes users and attendance through the on-site device agent.', 60),
       ('device_users', 'Device Users', 'Push and reconcile users on attendance devices.', 61),
       ('payroll', 'Payroll', 'Payroll periods, calculations, and exports.', 70),
       ('payroll_setup', 'Salary Setup', 'Configure employee compensation, earnings, and deductions.', 71),
       ('payout_view', 'Payout View', 'Preview actual employee payout calculations by pay period.', 73),
       ('disbursement', 'Disbursement', 'Track employee payroll payment processing and release.', 74),
       ('reports', 'Reports', 'Workforce and payroll reporting.', 80)
     ON CONFLICT (module_key) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description,
       sort_order = EXCLUDED.sort_order, is_active = TRUE`
  );
  await pool.query(
    `INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
     SELECT r.id, m.id,
       m.module_key NOT IN ('leave_application', 'overtime_request', 'shift_change'),
       m.module_key NOT IN ('leave_application', 'overtime_request', 'shift_change'),
       m.module_key NOT IN ('leave_application', 'overtime_request', 'shift_change'),
       m.module_key NOT IN ('leave_application', 'overtime_request', 'shift_change')
     FROM roles r CROSS JOIN modules m
     WHERE r.name = 'Administrator'
     ON CONFLICT (role_id, module_id) DO UPDATE SET
       can_create = EXCLUDED.can_create, can_view = EXCLUDED.can_view,
       can_update = EXCLUDED.can_update, can_delete = EXCLUDED.can_delete, updated_at = NOW()`
  );
  await pool.query(
    `INSERT INTO role_permissions (role_id, module_id, can_view)
     SELECT r.id, m.id, TRUE FROM roles r JOIN modules m ON m.module_key IN ('overview', 'setup', 'calendar', 'time_tracking', 'time_entries', 'shift_management', 'requests', 'leave_application', 'overtime_request', 'shift_change')
     WHERE r.name = 'Employee'
     ON CONFLICT (role_id, module_id) DO NOTHING`
  );
  await pool.query(
    `UPDATE role_permissions permission SET can_create = TRUE, can_update = TRUE, updated_at = NOW()
     FROM roles role, modules module
     WHERE permission.role_id = role.id AND permission.module_id = module.id
       AND role.name = 'Employee' AND module.module_key IN ('time_tracking', 'requests', 'leave_application')`
  );
  await pool.query(
    `INSERT INTO role_permissions (role_id, module_id, can_view, can_update)
     SELECT role.id, module.id, TRUE, TRUE
     FROM roles role CROSS JOIN modules module
     WHERE LOWER(role.name) = LOWER('HR Manager')
       AND module.module_key IN ('time_tracking', 'requests', 'leave_application')
     ON CONFLICT (role_id, module_id) DO UPDATE SET
       can_view = TRUE, can_update = TRUE, updated_at = NOW()`
  );
  await pool.query(
    `INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
     SELECT role.id, module.id, TRUE, TRUE, TRUE, TRUE
     FROM roles role CROSS JOIN modules module
     WHERE LOWER(role.name) IN ('hr manager', 'hr') AND module.module_key = 'calendar'
     ON CONFLICT (role_id, module_id) DO UPDATE SET
       can_create = TRUE, can_view = TRUE, can_update = TRUE, can_delete = TRUE, updated_at = NOW()`
  );
  const passwordHash = await bcrypt.hash(config.adminPassword, 12);
  const existingAdminPasswordUpdate = config.resetAdminPassword ? 'password_hash = EXCLUDED.password_hash,' : '';
  await pool.query(
    `INSERT INTO users (email, password_hash, display_name, role, role_id, is_system)
     VALUES ($1, $2, $3, 'administrator', (SELECT id FROM roles WHERE name = 'Administrator'), TRUE)
     ON CONFLICT (email) DO UPDATE SET
       ${existingAdminPasswordUpdate}
       display_name = EXCLUDED.display_name,
       role = 'administrator',
       role_id = EXCLUDED.role_id,
       is_system = TRUE,
       is_active = TRUE,
       updated_at = NOW()`,
    [config.adminEmail.toLowerCase(), passwordHash, config.adminName]
  );
  console.log('Database migration complete.');
} catch (error) {
  console.error('Database migration failed:', error.message || error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
