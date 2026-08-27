import express, { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';
import { canAssignWorkforceRole, hasPermission, requireAnyPermission, requirePermission } from '../auth/authorization.js';
import { isPositiveInteger } from '../validation.js';
import {
  deactivateEmployeeOrganization,
  getCurrentOrganizationAssignment,
  replaceCurrentOrganizationAssignment
} from '../organization/assignment-service.js';
import {
  currentDepartmentSql,
  currentJobTitleSql,
  currentOrganizationJoin
} from '../organization/current-organization-query.js';
import { ensureOrganizationSchema } from './organization.js';
import { parseEmployeeProfileInput } from '../workforce/profile-validation.js';

export const workforceRouter = Router();

const documentDirectory = fileURLToPath(new URL('../../uploads/employee-documents/', import.meta.url));
const acceptedDocumentTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png'
]);
const requiredProfileColumns = [
  'department', 'middle_name', 'suffix', 'address', 'date_of_birth', 'gender', 'civil_status',
  'profile_picture_data', 'profile_picture_mime_type', 'profile_picture_updated_at'
];
let employeeProfileSchemaReady;

const profileSummaryColumns = `
  employee.id, employee.employee_number AS "employeeNumber",
  employee.first_name AS "firstName", employee.middle_name AS "middleName",
  employee.last_name AS "lastName", employee.suffix,
  employee.preferred_name AS "preferredName", employee.email,
  ${currentJobTitleSql} AS "jobTitle",
  ${currentDepartmentSql} AS department,
  employee.employment_status AS "employmentStatus", employee.updated_at AS "updatedAt",
  (employee.profile_picture_data IS NOT NULL) AS "hasProfilePicture",
  employee.profile_picture_updated_at AS "profilePictureUpdatedAt"`;

const profileColumns = `
  employee.id, employee.employee_number AS "employeeNumber",
  employee.first_name AS "firstName", employee.middle_name AS "middleName",
  employee.last_name AS "lastName", employee.suffix, employee.preferred_name AS "preferredName",
  employee.email, employee.phone, employee.address,
  CASE WHEN employee.date_of_birth IS NULL THEN NULL ELSE TO_CHAR(employee.date_of_birth, 'YYYY-MM-DD') END AS "dateOfBirth",
  employee.gender, employee.civil_status AS "civilStatus",
  ${currentJobTitleSql} AS "jobTitle",
  ${currentDepartmentSql} AS department,
  CASE WHEN employee.hire_date IS NULL THEN NULL ELSE TO_CHAR(employee.hire_date, 'YYYY-MM-DD') END AS "hireDate",
  employee.emergency_contact_name AS "emergencyContactName",
  employee.emergency_contact_relationship AS "emergencyContactRelationship",
  employee.emergency_contact_phone AS "emergencyContactPhone",
  employee.emergency_contact_alternate_phone AS "emergencyContactAlternatePhone",
  employee.employment_status AS "employmentStatus", employee.created_at AS "createdAt",
  employee.updated_at AS "updatedAt", (employee.user_id IS NOT NULL) AS "hasLogin",
  COALESCE((SELECT account.is_active FROM users account WHERE account.id=employee.user_id), FALSE) AS "loginEnabled",
  (employee.profile_picture_data IS NOT NULL) AS "hasProfilePicture",
  employee.profile_picture_updated_at AS "profilePictureUpdatedAt"`;

function requestError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function profilePictureUrl(profile) {
  if (!profile.hasProfilePicture) return null;
  const timestamp = Date.parse(profile.profilePictureUpdatedAt || profile.updatedAt || '') || 0;
  return `/api/workforce/${profile.id}/profile-picture?v=${encodeURIComponent(timestamp)}`;
}

function serializeProfile(profile) {
  const { profilePictureUpdatedAt, ...serialized } = profile;
  return {
    ...serialized,
    hasProfilePicture:Boolean(profile.hasProfilePicture),
    profilePictureUrl:profilePictureUrl(profile)
  };
}

function employeeDisplayName(profile) {
  return [profile.firstName, profile.middleName, profile.lastName, profile.suffix]
    .filter(Boolean)
    .join(' ');
}

async function ensureEmployeeProfileSchema() {
  if (!employeeProfileSchemaReady) {
    employeeProfileSchemaReady = pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'employee_profiles'
         AND column_name = ANY($1::text[])`,
      [requiredProfileColumns]
    ).then((result) => {
      const present = new Set(result.rows.map((row) => row.column_name));
      const missing = requiredProfileColumns.filter((column) => !present.has(column));
      if (missing.length) {
        throw requestError('Employee profile data is unavailable. Run the database migrations and try again.', 503);
      }
    }).catch((error) => {
      employeeProfileSchemaReady = null;
      throw error;
    });
  }
  return employeeProfileSchemaReady;
}

async function nextEmployeeNumber(client) {
  const result = await client.query("SELECT nextval('employee_number_sequence') AS next_number");
  const nextNumber = Number(result.rows[0].next_number);
  if (nextNumber > 999999) throw requestError('The six-digit employee ID series is exhausted.', 409);
  return String(nextNumber).padStart(6, '0');
}

function handleDatabaseError(error, response, next) {
  if (error.status) return response.status(error.status).json({ error:error.message });
  if (error.code === '2200H') return response.status(409).json({ error:'The six-digit employee ID series is exhausted.' });
  if (error.code === '23505') {
    const field = error.constraint?.includes('employee_number') ? 'employee number' : 'email address';
    return response.status(409).json({ error:`That ${field} is already in use.` });
  }
  if (error.code === '22007' || error.code === '23514') return response.status(400).json({ error:'Please review the employee profile values and try again.' });
  return next(error);
}

async function loadWorkforceRole(client, roleId, user, currentRoleId = null) {
  const result = await client.query(
    "SELECT id, name FROM roles WHERE id=$1 AND name<>'Administrator'",
    [roleId]
  );
  const role = result.rows[0];
  if (!role) throw requestError('Select a valid employee role.');
  if (!canAssignWorkforceRole(user, role, currentRoleId)) {
    throw requestError('Roles & Access permission is required to assign this role.', 403);
  }
  return role;
}

function assignmentInput(body = {}) {
  if (body.syncOrganizationAssignment !== true) return { value:null };
  const departmentId = String(body.departmentId || '');
  const positionId = String(body.positionId || '');
  const managerEmployeeIds = Array.isArray(body.managerEmployeeIds)
    ? [...new Set(body.managerEmployeeIds.filter(Boolean).map(String))]
    : [];

  if (!isPositiveInteger(departmentId) || !isPositiveInteger(positionId)) {
    return { error:'Select both a department and a position.' };
  }
  if (managerEmployeeIds.some((id) => !isPositiveInteger(id))) {
    return { error:'The employee assignment contains an invalid manager.' };
  }
  return { value:{ departmentId, positionId, managerEmployeeIds, managerIdsProvided:Array.isArray(body.managerEmployeeIds) } };
}

async function saveOrganizationAssignment(client, employeeId, input) {
  if (!input) return null;
  const current = await getCurrentOrganizationAssignment(client, employeeId);
  if (Number(current.assignmentCount) > 1) {
    throw requestError('This employee has multiple current organization assignments. Manage those assignments from Organization.', 409);
  }
  return replaceCurrentOrganizationAssignment(client, {
    employeeId,
    unitIds:[input.departmentId],
    positionId:input.positionId,
    managerEmployeeIds:input.managerIdsProvided ? input.managerEmployeeIds : current.managerEmployeeIds
  });
}

async function loadProfileRecord(client, employeeId) {
  const result = await client.query(
    `SELECT ${profileColumns},
            (SELECT role.id::text FROM users account JOIN roles role ON role.id = account.role_id WHERE account.id = employee.user_id) AS "roleId",
            (SELECT role.name FROM users account JOIN roles role ON role.id = account.role_id WHERE account.id = employee.user_id) AS "roleName"
     FROM employee_profiles employee
     ${currentOrganizationJoin}
     WHERE employee.id = $1`,
    [employeeId]
  );
  return result.rows[0] || null;
}

async function loadPayrollSummary(client, employeeId) {
  const result = await client.query(
    `SELECT base_rate::double precision AS "basicPay", pay_basis AS "payBasis",
            pay_frequency AS "payFrequency", effective_date AS "effectiveDate"
     FROM employee_payroll_profiles WHERE employee_id = $1`,
    [employeeId]
  );
  return result.rows[0] || null;
}

async function loadWorkSchedule(client, employeeId) {
  const result = await client.query(
    `SELECT shift_type AS "shiftType", TO_CHAR(start_time, 'HH24:MI') AS "startTime",
            TO_CHAR(end_time, 'HH24:MI') AS "endTime", work_days AS "workDays"
     FROM employee_shift_assignments WHERE employee_id = $1`,
    [employeeId]
  );
  return result.rows[0] || null;
}

workforceRouter.get('/', ...requirePermission('workforce', 'view'), async (request, response, next) => {
  try {
    await ensureEmployeeProfileSchema();
    await ensureOrganizationSchema();
    const search = String(request.query.search || '').trim();
    const pattern = `%${search}%`;
    const result = await pool.query(
      `SELECT ${profileSummaryColumns}
       FROM employee_profiles employee
       ${currentOrganizationJoin}
       WHERE $1 = '' OR employee.employee_number ILIKE $2 OR employee.first_name ILIKE $2
          OR employee.middle_name ILIKE $2 OR employee.last_name ILIKE $2 OR employee.email ILIKE $2
          OR ${currentJobTitleSql} ILIKE $2
          OR ${currentDepartmentSql} ILIKE $2
       ORDER BY employee.last_name, employee.first_name
       LIMIT 200`,
      [search, pattern]
    );
    return response.json({ employees:result.rows.map(serializeProfile) });
  } catch (error) { return next(error); }
});

workforceRouter.get('/role-options', ...requireAnyPermission('workforce', ['create', 'update']), async (request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name FROM roles
       WHERE name <> 'Administrator'
       ORDER BY CASE WHEN name = 'Employee' THEN 0 ELSE 1 END, name`
    );
    const canManageRoles = hasPermission(request.user, 'roles', 'update');
    return response.json({
      roles:result.rows.map((role) => ({
        ...role,
        assignable:role.name === 'Employee' || canManageRoles
      }))
    });
  } catch (error) { return next(error); }
});

workforceRouter.get('/position-options', ...requireAnyPermission('workforce', ['create', 'update']), async (_request, response, next) => {
  try {
    await ensureOrganizationSchema();
    const result = await pool.query('SELECT id, name FROM organization_positions ORDER BY level, name');
    return response.json({ positions:result.rows });
  } catch (error) { return next(error); }
});

workforceRouter.get('/department-options', ...requireAnyPermission('workforce', ['create', 'update']), async (_request, response, next) => {
  try {
    await ensureOrganizationSchema();
    const result = await pool.query('SELECT id, name FROM organization_departments ORDER BY name');
    return response.json({ departments:result.rows });
  } catch (error) { return next(error); }
});

workforceRouter.get('/documents/:documentId/content', ...requirePermission('workforce', 'view'), async (request, response, next) => {
  try {
    if (!isPositiveInteger(request.params.documentId)) return response.status(400).json({ error:'Invalid document ID.' });
    const result = await pool.query('SELECT original_name, mime_type, storage_name FROM employee_documents WHERE id = $1', [request.params.documentId]);
    const document = result.rows[0];
    if (!document) return response.status(404).json({ error:'Document not found.' });
    const contents = await readFile(path.join(documentDirectory, document.storage_name));
    response.setHeader('Content-Type', document.mime_type);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(document.original_name)}`);
    return response.send(contents);
  } catch (error) {
    if (error.code === 'ENOENT') return response.status(404).json({ error:'Document file not found.' });
    return next(error);
  }
});

workforceRouter.get('/:id/profile-picture', ...requirePermission('workforce', 'view'), async (request, response, next) => {
  try {
    await ensureEmployeeProfileSchema();
    if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error:'Invalid employee ID.' });
    const result = await pool.query(
      `SELECT profile_picture_data AS data, profile_picture_mime_type AS "mimeType"
       FROM employee_profiles WHERE id = $1`,
      [request.params.id]
    );
    const profilePicture = result.rows[0];
    if (!profilePicture?.data || !profilePicture.mimeType) return response.status(404).json({ error:'No employee profile picture has been uploaded.' });
    response.setHeader('Cache-Control', 'private, no-store');
    response.type(profilePicture.mimeType);
    return response.send(profilePicture.data);
  } catch (error) { return next(error); }
});

workforceRouter.get('/:id', ...requirePermission('workforce', 'view'), async (request, response, next) => {
  const client = await pool.connect();
  try {
    await ensureEmployeeProfileSchema();
    await ensureOrganizationSchema();
    if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error:'Invalid employee ID.' });
    const profile = await loadProfileRecord(client, request.params.id);
    if (!profile) return response.status(404).json({ error:'Employee profile not found.' });
    const canViewOrganization = hasPermission(request.user, 'organization', 'view')
      || hasPermission(request.user, 'organization', 'update');
    const canViewPayroll = hasPermission(request.user, 'payroll_setup', 'view');
    const canViewSchedule = hasPermission(request.user, 'shift_management', 'view');
    const documents = await client.query(
      `SELECT id, original_name AS name, mime_type AS "mimeType", size_bytes AS size,
              uploaded_at AS "uploadedAt"
       FROM employee_documents WHERE employee_id = $1 ORDER BY uploaded_at, id`,
      [request.params.id]
    );
    const organizationAssignment = canViewOrganization
      ? await getCurrentOrganizationAssignment(client, request.params.id)
      : null;
    const payroll = canViewPayroll ? await loadPayrollSummary(client, request.params.id) : null;
    const workSchedule = canViewSchedule ? await loadWorkSchedule(client, request.params.id) : null;
    return response.json({
      employee:{
        ...serializeProfile(profile),
        documents:documents.rows,
        organizationAssignment,
        payroll,
        workSchedule
      }
    });
  } catch (error) { return next(error); }
  finally { client.release(); }
});

workforceRouter.post('/:id/documents', ...requireAnyPermission('workforce', ['create', 'update']), express.raw({ type:'application/octet-stream', limit:'10mb' }), async (request, response, next) => {
  if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error:'Invalid employee ID.' });
  let originalName;
  try { originalName = path.basename(decodeURIComponent(String(request.headers['x-file-name'] || ''))); }
  catch { return response.status(400).json({ error:'Invalid document name.' }); }
  const mimeType = String(request.headers['x-file-type'] || '').toLowerCase();
  if (!originalName || originalName.length > 240 || !acceptedDocumentTypes.has(mimeType)) return response.status(400).json({ error:'Unsupported document.' });
  if (!Buffer.isBuffer(request.body) || !request.body.length) return response.status(400).json({ error:'The document is empty.' });
  const employee = await pool.query('SELECT id FROM employee_profiles WHERE id = $1', [request.params.id]);
  if (!employee.rows[0]) return response.status(404).json({ error:'Employee profile not found.' });
  const storageName = randomUUID();
  const storagePath = path.join(documentDirectory, storageName);
  try {
    await mkdir(documentDirectory, { recursive:true });
    await writeFile(storagePath, request.body, { flag:'wx' });
    const result = await pool.query(
      `INSERT INTO employee_documents (employee_id, original_name, mime_type, size_bytes, storage_name)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, original_name AS name, mime_type AS "mimeType", size_bytes AS size, uploaded_at AS "uploadedAt"`,
      [request.params.id, originalName, mimeType, request.body.length, storageName]
    );
    return response.status(201).json({ document:result.rows[0] });
  } catch (error) {
    await unlink(storagePath).catch(() => {});
    return next(error);
  }
});

workforceRouter.post('/', ...requirePermission('workforce', 'create'), async (request, response, next) => {
  const parsedProfile = parseEmployeeProfileInput(request.body);
  const parsedAssignment = assignmentInput(request.body);
  const temporaryPassword = String(request.body?.temporaryPassword || '');
  if (parsedProfile.error) return response.status(400).json({ error:parsedProfile.error });
  if (parsedAssignment.error) return response.status(400).json({ error:parsedAssignment.error });
  if (!isPositiveInteger(request.body?.roleId)) return response.status(400).json({ error:'Select a valid employee role.' });
  if (temporaryPassword.length < 8) return response.status(400).json({ error:'Temporary password must be at least 8 characters.' });
  if (parsedAssignment.value && !hasPermission(request.user, 'organization', 'update')) {
    return response.status(403).json({ error:'You do not have permission to assign this employee to a department.' });
  }
  if (parsedAssignment.value && parsedProfile.value.employmentStatus !== 'active') {
    return response.status(400).json({ error:'An inactive employee cannot receive a current organization assignment.' });
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await ensureEmployeeProfileSchema();
    await ensureOrganizationSchema();
    await client.query('BEGIN');
    transactionStarted = true;
    const profile = parsedProfile.value;
    const employeeNumber = await nextEmployeeNumber(client);
    const role = await loadWorkforceRole(client, request.body.roleId, request.user);
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, display_name, role, role_id, is_active)
       VALUES ($1,$2,$3,'user',$4,$5) RETURNING id`,
      [profile.email, passwordHash, employeeDisplayName(profile), role.id, profile.employmentStatus === 'active']
    );
    const picture = profile.profilePicture;
    const employeeResult = await client.query(
      `INSERT INTO employee_profiles (
        user_id, employee_number, first_name, middle_name, last_name, suffix, preferred_name,
        email, phone, address, date_of_birth, gender, civil_status, hire_date,
        emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
        emergency_contact_alternate_phone, employment_status, profile_picture_data,
        profile_picture_mime_type, profile_picture_updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
        CASE WHEN $20::bytea IS NULL THEN NULL ELSE NOW() END
      ) RETURNING id`,
      [
        userResult.rows[0].id, employeeNumber, profile.firstName, profile.middleName, profile.lastName,
        profile.suffix, profile.preferredName, profile.email, profile.phone, profile.address,
        profile.dateOfBirth, profile.gender, profile.civilStatus, profile.hireDate,
        profile.emergencyContactName, profile.emergencyContactRelationship, profile.emergencyContactPhone,
        profile.emergencyContactAlternatePhone, profile.employmentStatus,
        picture.action === 'replace' ? picture.data : null,
        picture.action === 'replace' ? picture.mimeType : null
      ]
    );
    const employeeId = employeeResult.rows[0].id;
    await saveOrganizationAssignment(client, employeeId, parsedAssignment.value);
    const savedProfile = await loadProfileRecord(client, employeeId);
    await client.query('COMMIT');
    transactionStarted = false;
    return response.status(201).json({ employee:serializeProfile(savedProfile) });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    return handleDatabaseError(error, response, next);
  } finally { client.release(); }
});

workforceRouter.put('/:id', ...requirePermission('workforce', 'update'), async (request, response, next) => {
  if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error:'Invalid employee ID.' });
  const parsedProfile = parseEmployeeProfileInput(request.body);
  const parsedAssignment = assignmentInput(request.body);
  const temporaryPassword = String(request.body?.temporaryPassword || '');
  if (parsedProfile.error) return response.status(400).json({ error:parsedProfile.error });
  if (parsedAssignment.error) return response.status(400).json({ error:parsedAssignment.error });
  if (!isPositiveInteger(request.body?.roleId)) return response.status(400).json({ error:'Select a valid employee role.' });
  if (temporaryPassword && temporaryPassword.length < 8) return response.status(400).json({ error:'New password must be at least 8 characters.' });
  if (parsedAssignment.value && !hasPermission(request.user, 'organization', 'update')) {
    return response.status(403).json({ error:'You do not have permission to assign this employee to a department.' });
  }
  if (parsedAssignment.value && parsedProfile.value.employmentStatus !== 'active') {
    return response.status(400).json({ error:'An inactive employee cannot receive a current organization assignment.' });
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await ensureEmployeeProfileSchema();
    await ensureOrganizationSchema();
    await client.query('BEGIN');
    transactionStarted = true;
    const existing = await client.query(
      `SELECT employee.user_id,
              (SELECT account.role_id FROM users account WHERE account.id=employee.user_id) AS role_id
       FROM employee_profiles employee WHERE employee.id=$1 FOR UPDATE`,
      [request.params.id]
    );
    if (!existing.rowCount) throw requestError('Employee profile not found.', 404);
    const profile = parsedProfile.value;
    const role = await loadWorkforceRole(client, request.body.roleId, request.user, existing.rows[0].role_id);

    let userId = existing.rows[0].user_id;
    const displayName = employeeDisplayName(profile);
    if (userId) {
      if (temporaryPassword) {
        const passwordHash = await bcrypt.hash(temporaryPassword, 12);
        await client.query(
          "UPDATE users SET email=$1, display_name=$2, password_hash=$3, role='user', role_id=$4, is_active=$5, updated_at=NOW() WHERE id=$6",
          [profile.email, displayName, passwordHash, role.id, profile.employmentStatus === 'active', userId]
        );
      } else {
        await client.query(
          "UPDATE users SET email=$1, display_name=$2, role='user', role_id=$3, is_active=$4, updated_at=NOW() WHERE id=$5",
          [profile.email, displayName, role.id, profile.employmentStatus === 'active', userId]
        );
      }
    } else if (temporaryPassword) {
      const passwordHash = await bcrypt.hash(temporaryPassword, 12);
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, display_name, role, role_id, is_active)
         VALUES ($1,$2,$3,'user',$4,$5) RETURNING id`,
        [profile.email, passwordHash, displayName, role.id, profile.employmentStatus === 'active']
      );
      userId = userResult.rows[0].id;
    }

    const picture = profile.profilePicture;
    const pictureChanged = picture.action !== 'keep';
    const pictureData = picture.action === 'replace' ? picture.data : null;
    const pictureMimeType = picture.action === 'replace' ? picture.mimeType : null;
    await client.query(
      `UPDATE employee_profiles SET
        first_name=$1, middle_name=$2, last_name=$3, suffix=$4, preferred_name=$5,
        email=$6, phone=$7, address=$8, date_of_birth=$9, gender=$10, civil_status=$11,
        hire_date=$12, emergency_contact_name=$13, emergency_contact_relationship=$14,
        emergency_contact_phone=$15, emergency_contact_alternate_phone=$16,
        employment_status=$17, user_id=$18,
        profile_picture_data=CASE WHEN $19::boolean THEN $20::bytea ELSE profile_picture_data END,
        profile_picture_mime_type=CASE WHEN $19::boolean THEN $21::text ELSE profile_picture_mime_type END,
        profile_picture_updated_at=CASE WHEN $19::boolean THEN NOW() ELSE profile_picture_updated_at END,
        updated_at=NOW()
       WHERE id=$22`,
      [
        profile.firstName, profile.middleName, profile.lastName, profile.suffix, profile.preferredName,
        profile.email, profile.phone, profile.address, profile.dateOfBirth, profile.gender, profile.civilStatus,
        profile.hireDate, profile.emergencyContactName, profile.emergencyContactRelationship,
        profile.emergencyContactPhone, profile.emergencyContactAlternatePhone, profile.employmentStatus, userId,
        pictureChanged, pictureData, pictureMimeType, request.params.id
      ]
    );
    if (profile.employmentStatus === 'inactive') {
      await deactivateEmployeeOrganization(client, request.params.id);
    } else {
      await saveOrganizationAssignment(client, request.params.id, parsedAssignment.value);
    }
    const savedProfile = await loadProfileRecord(client, request.params.id);
    await client.query('COMMIT');
    transactionStarted = false;
    return response.json({ employee:serializeProfile(savedProfile) });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    return handleDatabaseError(error, response, next);
  } finally { client.release(); }
});

workforceRouter.delete('/:id', ...requirePermission('workforce', 'delete'), async (request, response, next) => {
  if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error:'Invalid employee ID.' });
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const documents = await client.query('SELECT storage_name FROM employee_documents WHERE employee_id = $1', [request.params.id]);
    const result = await client.query('DELETE FROM employee_profiles WHERE id = $1 RETURNING id, user_id', [request.params.id]);
    if (!result.rowCount) throw requestError('Employee profile not found.', 404);
    if (result.rows[0].user_id) {
      await client.query('DELETE FROM users WHERE id = $1 AND is_system = FALSE', [result.rows[0].user_id]);
    }
    await client.query('COMMIT');
    transactionStarted = false;
    await Promise.all(documents.rows.map((document) => unlink(path.join(documentDirectory, document.storage_name)).catch(() => {})));
    return response.status(204).end();
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    if (error.code === '23503' || error.code === '23001') {
      return response.status(409).json({
        error:'This employee is referenced by payroll or organization history. Mark the employee inactive instead of deleting the profile.'
      });
    }
    return next(error);
  } finally { client.release(); }
});
