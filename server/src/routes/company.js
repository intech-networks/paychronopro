import { Router } from 'express';
import { requirePermission } from '../auth/authorization.js';
import { validateCompanyProfileInput } from '../company/validation.js';
import { pool } from '../db/pool.js';

export const companyRouter = Router();

const profileColumns = `
  company_name AS "companyName",
  company_address AS "companyAddress",
  contact_number AS "contactNumber",
  email_address AS "emailAddress",
  website,
  description,
  logo_data IS NOT NULL AS "hasLogo",
  updated_at AS "updatedAt"
`;

function serializeProfile(profile) {
  const logoVersion = profile.updatedAt ? new Date(profile.updatedAt).valueOf() : 0;
  return {
    companyName: profile.companyName || '',
    companyAddress: profile.companyAddress || '',
    contactNumber: profile.contactNumber || '',
    emailAddress: profile.emailAddress || '',
    website: profile.website || '',
    description: profile.description || '',
    hasLogo: Boolean(profile.hasLogo),
    logoUrl: profile.hasLogo ? `/api/company/profile/logo?v=${encodeURIComponent(logoVersion)}` : null,
    updatedAt: profile.updatedAt
  };
}

async function ensureProfileRow(client) {
  await client.query('INSERT INTO company_profiles (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
}

async function loadProfile(client = pool) {
  await ensureProfileRow(client);
  const result = await client.query(`SELECT ${profileColumns} FROM company_profiles WHERE id=1`);
  return result.rows[0];
}

async function loadDepartments(client = pool) {
  const result = await client.query(
    `SELECT department.id, department.name, department.description,
            department.unit_type AS "unitType",
            COUNT(DISTINCT employee.id)::integer AS "employeeCount"
     FROM organization_departments department
     LEFT JOIN organization_assignments assignment
       ON assignment.unit_id=department.id
       AND assignment.effective_from<=CURRENT_DATE
       AND (assignment.effective_to IS NULL OR assignment.effective_to>=CURRENT_DATE)
     LEFT JOIN employee_profiles employee
       ON employee.id=assignment.employee_id AND employee.employment_status='active'
     GROUP BY department.id, department.name, department.description, department.unit_type
     ORDER BY department.name, department.id`
  );
  return result.rows;
}

async function loadEmployeeAssignments(client = pool) {
  const result = await client.query(
    `SELECT employee.id AS "employeeId", employee.employee_number AS "employeeNumber",
            employee.first_name AS "firstName", employee.last_name AS "lastName",
            COALESCE(STRING_AGG(DISTINCT position.name, ', ' ORDER BY position.name), '') AS "positionName",
            COALESCE(STRING_AGG(DISTINCT department.name, ', ' ORDER BY department.name), '') AS "unitNames"
     FROM employee_profiles employee
     LEFT JOIN organization_assignments assignment
       ON assignment.employee_id=employee.id
       AND assignment.effective_from<=CURRENT_DATE
       AND (assignment.effective_to IS NULL OR assignment.effective_to>=CURRENT_DATE)
     LEFT JOIN organization_departments department ON department.id=assignment.unit_id
     LEFT JOIN organization_positions position ON position.id=assignment.position_id
     WHERE employee.employment_status='active'
     GROUP BY employee.id, employee.employee_number, employee.first_name, employee.last_name
     ORDER BY employee.last_name, employee.first_name, employee.id`
  );
  return result.rows;
}

function companyWriteError(error, response) {
  if (error?.code === '23514' || error?.code === '22001') {
    response.status(400).json({ error:'Please review the company profile values and try again.' });
    return true;
  }
  if (error?.code === '23503') {
    response.status(409).json({ error:'The profile could not be saved because the signed-in user is no longer available.' });
    return true;
  }
  return false;
}

companyRouter.get('/profile', ...requirePermission('company', 'view'), async (_request, response, next) => {
  const client = await pool.connect();
  try {
    const profile = await loadProfile(client);
    const departments = await loadDepartments(client);
    const employees = await loadEmployeeAssignments(client);
    response.setHeader('Cache-Control', 'private, no-store');
    return response.json({ company:serializeProfile(profile), departments, employees });
  } catch (error) {
    return next(error);
  } finally {
    client.release();
  }
});

companyRouter.get('/profile/logo', ...requirePermission('company', 'view'), async (_request, response, next) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT logo_data AS "logoData", logo_mime_type AS "logoMimeType" FROM company_profiles WHERE id=1'
    );
    const logo = result.rows[0];
    if (!logo?.logoData || !logo.logoMimeType) return response.status(404).json({ error:'No company logo has been uploaded.' });
    response.setHeader('Cache-Control', 'private, no-store');
    response.type(logo.logoMimeType);
    return response.send(logo.logoData);
  } catch (error) {
    return next(error);
  } finally {
    client.release();
  }
});

companyRouter.put('/profile', ...requirePermission('company', 'update'), async (request, response, next) => {
  const parsed = validateCompanyProfileInput(request.body);
  if (parsed.error) return response.status(400).json({ error:parsed.error });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureProfileRow(client);
    const replaceLogo = parsed.value.clearLogo || parsed.value.logo !== null;
    const result = await client.query(
      `UPDATE company_profiles
       SET company_name=$1, company_address=$2, contact_number=$3, email_address=$4,
           website=$5, description=$6,
           logo_data=CASE WHEN $7::boolean THEN $8::bytea ELSE logo_data END,
           logo_mime_type=CASE WHEN $7::boolean THEN $9::text ELSE logo_mime_type END,
           updated_by=$10, updated_at=NOW()
       WHERE id=1
       RETURNING ${profileColumns}`,
      [
        parsed.value.companyName,
        parsed.value.companyAddress,
        parsed.value.contactNumber,
        parsed.value.emailAddress,
        parsed.value.website,
        parsed.value.description,
        replaceLogo,
        parsed.value.logo?.data || null,
        parsed.value.logo?.mimeType || null,
        request.user.id
      ]
    );
    await client.query('COMMIT');
    response.setHeader('Cache-Control', 'private, no-store');
    return response.json({ company:serializeProfile(result.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    if (companyWriteError(error, response)) return undefined;
    return next(error);
  } finally {
    client.release();
  }
});
