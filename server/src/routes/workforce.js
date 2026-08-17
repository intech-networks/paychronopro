import express, { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';
import { requireAnyPermission, requirePermission } from '../auth/authorization.js';
import { isEmail, isIsoDate, isPositiveInteger } from '../validation.js';

export const workforceRouter = Router();
const documentDirectory = fileURLToPath(new URL('../../uploads/employee-documents/', import.meta.url));
const acceptedDocumentTypes = new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png']);

const profileColumns = `
  id, employee_number AS "employeeNumber", first_name AS "firstName",
  last_name AS "lastName", preferred_name AS "preferredName", email, phone,
  job_title AS "jobTitle", department, hire_date AS "hireDate",
  emergency_contact_name AS "emergencyContactName",
  emergency_contact_relationship AS "emergencyContactRelationship",
  emergency_contact_phone AS "emergencyContactPhone",
  emergency_contact_alternate_phone AS "emergencyContactAlternatePhone",
  employment_status AS "employmentStatus", created_at AS "createdAt",
  updated_at AS "updatedAt", (user_id IS NOT NULL) AS "hasLogin"`;

function profileInput(body = {}) {
  return {
    employeeNumber: String(body.employeeNumber || '').trim(),
    firstName: String(body.firstName || '').trim(),
    lastName: String(body.lastName || '').trim(),
    preferredName: String(body.preferredName || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    phone: String(body.phone || '').trim(),
    jobTitle: String(body.jobTitle || '').trim(),
    department: String(body.department || '').trim(),
    hireDate: body.hireDate || null,
    emergencyContactName: String(body.emergencyContactName || '').trim(),
    emergencyContactRelationship: String(body.emergencyContactRelationship || '').trim(),
    emergencyContactPhone: String(body.emergencyContactPhone || '').trim(),
    emergencyContactAlternatePhone: String(body.emergencyContactAlternatePhone || '').trim(),
    employmentStatus: String(body.employmentStatus || 'active')
  };
}

function validateProfile(profile) {
  if (!profile.firstName || !profile.lastName || !profile.email) {
    return 'First name, last name, and email are required.';
  }
  if (!isEmail(profile.email)) return 'Enter a valid email address.';
  if (!isIsoDate(profile.hireDate)) return 'Enter a valid hire date.';
  if ([profile.firstName, profile.lastName, profile.preferredName,
    profile.phone, profile.jobTitle, profile.department, profile.emergencyContactName,
    profile.emergencyContactRelationship, profile.emergencyContactPhone,
    profile.emergencyContactAlternatePhone].some((value) => value.length > 200)) {
    return 'One or more fields are too long.';
  }
  if (!['active', 'inactive'].includes(profile.employmentStatus)) {
    return 'Invalid employment status.';
  }
  return null;
}

async function nextEmployeeNumber(client) {
  // Serialize number allocation so simultaneous employee creation cannot receive the same ID.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('employee_profiles.employee_number'))");
  const result = await client.query(
    `SELECT COALESCE(MAX(employee_number::INTEGER), 0) + 1 AS next_number
     FROM employee_profiles
     WHERE employee_number ~ '^[0-9]{6}$'`
  );
  const nextNumber = Number(result.rows[0].next_number);
  if (nextNumber > 999999) throw Object.assign(new Error('The six-digit employee ID series is exhausted.'), { status: 409 });
  return String(nextNumber).padStart(6, '0');
}

function handleDatabaseError(error, response, next) {
  if (error.status) return response.status(error.status).json({ error: error.message });
  if (error.code === '23505') {
    const field = error.constraint?.includes('employee_number') ? 'employee number' : 'email address';
    return response.status(409).json({ error: `That ${field} is already in use.` });
  }
  if (error.code === '22007') return response.status(400).json({ error: 'Invalid date.' });
  return next(error);
}

workforceRouter.get('/', ...requirePermission('workforce', 'view'), async (request, response, next) => {
  try {
    const search = String(request.query.search || '').trim();
    const pattern = `%${search}%`;
    const result = await pool.query(
      `SELECT ${profileColumns} FROM employee_profiles
       WHERE $1 = '' OR employee_number ILIKE $2 OR first_name ILIKE $2
          OR last_name ILIKE $2 OR email ILIKE $2 OR department ILIKE $2
          OR job_title ILIKE $2
       ORDER BY last_name, first_name LIMIT 200`,
      [search, pattern]
    );
    response.json({ employees: result.rows });
  } catch (error) { next(error); }
});

workforceRouter.get('/role-options', ...requireAnyPermission('workforce', ['create', 'update']), async (_request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name FROM roles
       WHERE name <> 'Administrator'
       ORDER BY CASE WHEN name = 'Employee' THEN 0 ELSE 1 END, name`
    );
    response.json({ roles: result.rows });
  } catch (error) { next(error); }
});

workforceRouter.get('/department-options', ...requireAnyPermission('workforce', ['create', 'update']), async (_request, response, next) => {
  try {
    const result = await pool.query('SELECT id, name FROM departments ORDER BY name');
    response.json({ departments: result.rows });
  } catch (error) { next(error); }
});

workforceRouter.get('/documents/:documentId/content', ...requirePermission('workforce', 'view'), async (request, response, next) => {
  try {
    if (!isPositiveInteger(request.params.documentId)) return response.status(400).json({ error: 'Invalid document ID.' });
    const result = await pool.query('SELECT original_name, mime_type, storage_name FROM employee_documents WHERE id = $1', [request.params.documentId]);
    const document = result.rows[0];
    if (!document) return response.status(404).json({ error: 'Document not found.' });
    const contents = await readFile(path.join(documentDirectory, document.storage_name));
    response.setHeader('Content-Type', document.mime_type);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(document.original_name)}`);
    return response.send(contents);
  } catch (error) {
    if (error.code === 'ENOENT') return response.status(404).json({ error: 'Document file not found.' });
    return next(error);
  }
});

workforceRouter.get('/:id', ...requirePermission('workforce', 'view'), async (request, response, next) => {
  try {
    if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error: 'Invalid employee ID.' });
    const result = await pool.query(
      `SELECT ${profileColumns},
              (SELECT r.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = user_id) AS "roleId",
              (SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = user_id) AS "roleName"
       FROM employee_profiles WHERE id = $1`,
      [request.params.id]
    );
    if (!result.rows[0]) return response.status(404).json({ error: 'Employee profile not found.' });
    const documents = await pool.query(
      `SELECT id, original_name AS name, mime_type AS "mimeType", size_bytes AS size,
              uploaded_at AS "uploadedAt"
       FROM employee_documents WHERE employee_id = $1 ORDER BY uploaded_at, id`,
      [request.params.id]
    );
    response.json({ employee: { ...result.rows[0], documents: documents.rows } });
  } catch (error) { next(error); }
});

workforceRouter.post('/:id/documents', ...requireAnyPermission('workforce', ['create', 'update']), express.raw({ type: 'application/octet-stream', limit: '10mb' }), async (request, response, next) => {
  if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error: 'Invalid employee ID.' });
  let originalName;
  try { originalName = path.basename(decodeURIComponent(String(request.headers['x-file-name'] || ''))); } catch { return response.status(400).json({ error: 'Invalid document name.' }); }
  const mimeType = String(request.headers['x-file-type'] || '').toLowerCase();
  if (!originalName || originalName.length > 240 || !acceptedDocumentTypes.has(mimeType)) return response.status(400).json({ error: 'Unsupported document.' });
  if (!Buffer.isBuffer(request.body) || !request.body.length) return response.status(400).json({ error: 'The document is empty.' });
  const employee = await pool.query('SELECT id FROM employee_profiles WHERE id = $1', [request.params.id]);
  if (!employee.rows[0]) return response.status(404).json({ error: 'Employee profile not found.' });
  const storageName = randomUUID();
  const storagePath = path.join(documentDirectory, storageName);
  try {
    await mkdir(documentDirectory, { recursive: true });
    await writeFile(storagePath, request.body, { flag: 'wx' });
    const result = await pool.query(
      `INSERT INTO employee_documents (employee_id, original_name, mime_type, size_bytes, storage_name)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, original_name AS name, mime_type AS "mimeType", size_bytes AS size, uploaded_at AS "uploadedAt"`,
      [request.params.id, originalName, mimeType, request.body.length, storageName]
    );
    response.status(201).json({ document: result.rows[0] });
  } catch (error) {
    await unlink(storagePath).catch(() => {});
    next(error);
  }
});

workforceRouter.post('/', ...requirePermission('workforce', 'create'), async (request, response, next) => {
  const profile = profileInput(request.body);
  const temporaryPassword = String(request.body?.temporaryPassword || '');
  const validationError = validateProfile(profile);
  if (validationError) return response.status(400).json({ error: validationError });
  if (!isPositiveInteger(request.body?.roleId)) return response.status(400).json({ error: 'Select a valid employee role.' });
  if (temporaryPassword.length < 8) return response.status(400).json({ error: 'Temporary password must be at least 8 characters.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    profile.employeeNumber = await nextEmployeeNumber(client);
    const roleResult = await client.query("SELECT id FROM roles WHERE id = $1 AND name <> 'Administrator'", [request.body.roleId]);
    if (!roleResult.rows[0]) {
      await client.query('ROLLBACK');
      return response.status(400).json({ error: 'Select a valid employee role.' });
    }
    const departmentResult = profile.department
      ? await client.query('SELECT id, name FROM departments WHERE name = $1', [profile.department])
      : { rows: [] };
    if (profile.department && !departmentResult.rows[0]) {
      await client.query('ROLLBACK');
      return response.status(400).json({ error: 'Select a valid department.' });
    }
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, display_name, role, role_id)
       VALUES ($1, $2, $3, 'user', $4)
       RETURNING id`,
      [profile.email, passwordHash, `${profile.firstName} ${profile.lastName}`, roleResult.rows[0].id]
    );
    const result = await client.query(
      `INSERT INTO employee_profiles
       (user_id, employee_number, first_name, last_name, preferred_name, email, phone,
        job_title, department, hire_date, emergency_contact_name,
        emergency_contact_relationship, emergency_contact_phone,
        emergency_contact_alternate_phone, employment_status)
       VALUES ($15,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING ${profileColumns}`,
      [...Object.values(profile), userResult.rows[0].id]
    );
    if (departmentResult.rows[0]) {
      await client.query(
        "INSERT INTO department_assignments (department_id, employee_id, assignment_role) VALUES ($1,$2,'member')",
        [departmentResult.rows[0].id, result.rows[0].id]
      );
    }
    await client.query('COMMIT');
    response.status(201).json({ employee: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    handleDatabaseError(error, response, next);
  } finally { client.release(); }
});

workforceRouter.put('/:id', ...requirePermission('workforce', 'update'), async (request, response, next) => {
  if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error: 'Invalid employee ID.' });
  const profile = profileInput(request.body);
  const temporaryPassword = String(request.body?.temporaryPassword || '');
  const validationError = validateProfile(profile);
  if (validationError) return response.status(400).json({ error: validationError });
  if (!isPositiveInteger(request.body?.roleId)) return response.status(400).json({ error: 'Select a valid employee role.' });
  if (temporaryPassword && temporaryPassword.length < 8) return response.status(400).json({ error: 'New password must be at least 8 characters.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT user_id, employee_number FROM employee_profiles WHERE id = $1 FOR UPDATE', [request.params.id]);
    if (!existing.rows[0]) {
      await client.query('ROLLBACK');
      return response.status(404).json({ error: 'Employee profile not found.' });
    }
    profile.employeeNumber = existing.rows[0].employee_number;
    const roleResult = await client.query("SELECT id FROM roles WHERE id = $1 AND name <> 'Administrator'", [request.body.roleId]);
    if (!roleResult.rows[0]) {
      await client.query('ROLLBACK');
      return response.status(400).json({ error: 'Select a valid employee role.' });
    }
    const departmentResult = profile.department
      ? await client.query('SELECT id, name FROM departments WHERE name = $1', [profile.department])
      : { rows: [] };
    if (profile.department && !departmentResult.rows[0]) {
      await client.query('ROLLBACK');
      return response.status(400).json({ error: 'Select a valid department.' });
    }
    let userId = existing.rows[0].user_id;
    const displayName = `${profile.firstName} ${profile.lastName}`;
    if (userId) {
      if (temporaryPassword) {
        const passwordHash = await bcrypt.hash(temporaryPassword, 12);
        await client.query("UPDATE users SET email=$1, display_name=$2, password_hash=$3, role='user', role_id=$4, updated_at=NOW() WHERE id=$5", [profile.email, displayName, passwordHash, roleResult.rows[0].id, userId]);
      } else {
        await client.query("UPDATE users SET email=$1, display_name=$2, role='user', role_id=$3, updated_at=NOW() WHERE id=$4", [profile.email, displayName, roleResult.rows[0].id, userId]);
      }
    } else if (temporaryPassword) {
      const passwordHash = await bcrypt.hash(temporaryPassword, 12);
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, display_name, role, role_id)
         VALUES ($1, $2, $3, 'user', $4) RETURNING id`,
        [profile.email, passwordHash, displayName, roleResult.rows[0].id]
      );
      userId = userResult.rows[0].id;
    }
    const values = Object.values(profile);
    values.push(userId, request.params.id);
    const result = await client.query(
      `UPDATE employee_profiles SET
         employee_number=$1, first_name=$2, last_name=$3, preferred_name=$4,
         email=$5, phone=$6, job_title=$7, department=$8, hire_date=$9,
         emergency_contact_name=$10, emergency_contact_relationship=$11,
         emergency_contact_phone=$12, emergency_contact_alternate_phone=$13,
         employment_status=$14, user_id=$15, updated_at=NOW()
       WHERE id=$16 RETURNING ${profileColumns}`,
      values
    );
    if (departmentResult.rows[0]) {
      await client.query(
        `INSERT INTO department_assignments (department_id, employee_id, assignment_role)
         VALUES ($1,$2,'member')
         ON CONFLICT (employee_id) DO UPDATE SET
           department_id = EXCLUDED.department_id,
           assignment_role = CASE
             WHEN department_assignments.department_id = EXCLUDED.department_id
               AND department_assignments.assignment_role IN ('manager', 'assistant_manager')
             THEN department_assignments.assignment_role ELSE 'member' END,
           assigned_at = NOW()`,
        [departmentResult.rows[0].id, request.params.id]
      );
    } else {
      await client.query('DELETE FROM department_assignments WHERE employee_id = $1', [request.params.id]);
    }
    await client.query('COMMIT');
    response.json({ employee: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    handleDatabaseError(error, response, next);
  } finally { client.release(); }
});

workforceRouter.delete('/:id', ...requirePermission('workforce', 'delete'), async (request, response, next) => {
  if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error: 'Invalid employee ID.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const documentResult = await client.query('SELECT storage_name FROM employee_documents WHERE employee_id = $1', [request.params.id]);
    const result = await client.query('DELETE FROM employee_profiles WHERE id = $1 RETURNING id, user_id', [request.params.id]);
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return response.status(404).json({ error: 'Employee profile not found.' });
    }
    if (result.rows[0].user_id) await client.query('DELETE FROM users WHERE id = $1 AND is_system = FALSE', [result.rows[0].user_id]);
    await client.query('COMMIT');
    await Promise.all(documentResult.rows.map((document) => unlink(path.join(documentDirectory, document.storage_name)).catch(() => {})));
    response.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});
