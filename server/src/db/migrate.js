import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
import { config } from '../config.js';

const migrationPath = fileURLToPath(new URL('../../../database/init.sql', import.meta.url));
const migrationsDirectory = fileURLToPath(new URL('../../../database/migrations', import.meta.url));

try {
  if (config.isProduction && config.adminPassword === 'ChangeMe123!') {
    throw new Error('ADMIN_PASSWORD must be changed before running production migrations.');
  }
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
       ('Employee', 'Standard employee self-service access.', TRUE)
     ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, is_system = TRUE`
  );
  await pool.query(
    `INSERT INTO modules (module_key, name, description, sort_order) VALUES
       ('overview', 'Overview', 'Dashboard overview and personal summary.', 10),
       ('workforce', 'Workforce', 'Employee profiles and workforce records.', 20),
       ('departments', 'Departments', 'Department structures and employee assignments.', 30),
       ('roles', 'Roles & Access', 'Roles and module operation permissions.', 40),
       ('time_tracking', 'Time Tracking', 'Time entries, clock-ins, and timesheets.', 50),
       ('payroll', 'Payroll', 'Payroll periods, calculations, and exports.', 60),
       ('reports', 'Reports', 'Workforce and payroll reporting.', 70)
     ON CONFLICT (module_key) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description,
       sort_order = EXCLUDED.sort_order, is_active = TRUE`
  );
  await pool.query(
    `INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
     SELECT r.id, m.id, TRUE, TRUE, TRUE, TRUE FROM roles r CROSS JOIN modules m
     WHERE r.name = 'Administrator'
     ON CONFLICT (role_id, module_id) DO UPDATE SET
       can_create = TRUE, can_view = TRUE, can_update = TRUE, can_delete = TRUE, updated_at = NOW()`
  );
  await pool.query(
    `INSERT INTO role_permissions (role_id, module_id, can_view)
     SELECT r.id, m.id, TRUE FROM roles r JOIN modules m ON m.module_key IN ('overview', 'time_tracking')
     WHERE r.name = 'Employee'
     ON CONFLICT (role_id, module_id) DO NOTHING`
  );
  const passwordHash = await bcrypt.hash(config.adminPassword, 12);
  await pool.query(
    `INSERT INTO users (email, password_hash, display_name, role, role_id, is_system)
     VALUES ($1, $2, $3, 'administrator', (SELECT id FROM roles WHERE name = 'Administrator'), TRUE)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
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
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
