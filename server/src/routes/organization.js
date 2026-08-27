import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requirePermission } from '../auth/authorization.js';
import { isIsoDate, isPositiveInteger } from '../validation.js';
import { replaceCurrentOrganizationAssignment } from '../organization/assignment-service.js';

export const organizationRouter = Router();

let organizationSchemaReady;

export async function ensureOrganizationSchema() {
  if (!organizationSchemaReady) {
    organizationSchemaReady = pool.query(
      "SELECT " +
      "EXISTS (SELECT 1 FROM information_schema.tables " +
      "WHERE table_schema = current_schema() AND table_name = 'organization_departments') AS departments, " +
      "EXISTS (SELECT 1 FROM information_schema.tables " +
      "WHERE table_schema = current_schema() AND table_name = 'organization_positions') AS positions, " +
      "EXISTS (SELECT 1 FROM information_schema.tables " +
      "WHERE table_schema = current_schema() AND table_name = 'organization_assignments') AS assignments, " +
      "EXISTS (SELECT 1 FROM information_schema.tables " +
      "WHERE table_schema = current_schema() AND table_name = 'organization_assignment_managers') AS assignment_managers"
    ).then((result) => {
      const tables = result.rows[0] || {};
      const missing = Object.entries(tables)
        .filter(([, present]) => !present)
        .map(([name]) => name.replace('_', ' '));
      if (missing.length) {
        throw Object.assign(
          new Error('Organization data is unavailable. Run the database migrations and try again.'),
          { status:503 }
        );
      }
    }).catch((error) => {
      organizationSchemaReady = null;
      throw error;
    });
  }
  return organizationSchemaReady;
}

function departmentInput(body = {}) {
  return {
    name: String(body.name || '').trim(),
    description: String(body.description || '').trim(),
    parentId: body.parentId ? String(body.parentId) : null,
    unitType: String(body.unitType || 'department')
  };
}

function validateDepartment(department) {
  if (!department.name) return 'Department name is required.';
  if (department.name.length > 120) return 'Department name cannot exceed 120 characters.';
  if (department.description.length > 1000) return 'Department description cannot exceed 1,000 characters.';
  if (department.parentId && !isPositiveInteger(department.parentId)) return 'Select a valid parent unit.';
  if (!['department', 'team'].includes(department.unitType)) return 'Select a valid unit type.';
  return null;
}

function handleDepartmentError(error, response, next) {
  if (error.code === '23505') return response.status(409).json({ error:'That department name is already in use.' });
  return next(error);
}

organizationRouter.get('/departments', ...requirePermission('organization', 'view'), async (_request, response, next) => {
  try {
    await ensureOrganizationSchema();
    const result = await pool.query(
      `SELECT unit.id, unit.name, unit.description, unit.parent_id AS "parentId", unit.unit_type AS "unitType",
              COUNT(DISTINCT member.id)::INTEGER AS "memberCount",
              unit.created_at AS "createdAt", unit.updated_at AS "updatedAt"
       FROM organization_departments unit
       LEFT JOIN organization_assignments assignment
         ON assignment.unit_id=unit.id
         AND assignment.effective_from<=CURRENT_DATE
         AND (assignment.effective_to IS NULL OR assignment.effective_to>=CURRENT_DATE)
       LEFT JOIN employee_profiles member
         ON member.id=assignment.employee_id
         AND member.employment_status='active'
       GROUP BY unit.id ORDER BY unit.name`
    );
    return response.json({ departments:result.rows });
  } catch (error) { return next(error); }
});

organizationRouter.post('/departments', ...requirePermission('organization', 'create'), async (request, response, next) => {
  const department = departmentInput(request.body);
  const validationError = validateDepartment(department);
  if (validationError) return response.status(400).json({ error:validationError });
  try {
    await ensureOrganizationSchema();
    const result = await pool.query(
      `INSERT INTO organization_departments (name, description, parent_id, unit_type) VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, parent_id AS "parentId", unit_type AS "unitType", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [department.name, department.description, department.parentId, department.unitType]
    );
    return response.status(201).json({ department:result.rows[0] });
  } catch (error) { return handleDepartmentError(error, response, next); }
});

organizationRouter.put('/departments/:id', ...requirePermission('organization', 'update'), async (request, response, next) => {
  if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error:'Invalid department ID.' });
  const department = departmentInput(request.body);
  const validationError = validateDepartment(department);
  if (validationError) return response.status(400).json({ error:validationError });
  try {
    await ensureOrganizationSchema();
    if (department.parentId) {
      const ancestry = await pool.query(
        `WITH RECURSIVE descendants AS (
           SELECT id FROM organization_departments WHERE parent_id=$1
           UNION ALL SELECT child.id FROM organization_departments child JOIN descendants parent ON child.parent_id=parent.id
         ) SELECT 1 FROM descendants WHERE id=$2`, [request.params.id, department.parentId]
      );
      if (String(department.parentId) === String(request.params.id) || ancestry.rowCount) return response.status(400).json({ error:'An organizational unit cannot be moved beneath itself or one of its children.' });
    }
    const result = await pool.query(
      `UPDATE organization_departments SET name=$1, description=$2, parent_id=$3, unit_type=$4, updated_at=NOW()
       WHERE id=$5
       RETURNING id, name, description, parent_id AS "parentId", unit_type AS "unitType", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [department.name, department.description, department.parentId, department.unitType, request.params.id]
    );
    if (!result.rowCount) return response.status(404).json({ error:'Department not found.' });
    return response.json({ department:result.rows[0] });
  } catch (error) { return handleDepartmentError(error, response, next); }
});

organizationRouter.delete('/departments/:id', ...requirePermission('organization', 'delete'), async (request, response, next) => {
  if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error:'Invalid department ID.' });
  try {
    await ensureOrganizationSchema();
    const result = await pool.query('DELETE FROM organization_departments WHERE id=$1 RETURNING id', [request.params.id]);
    if (!result.rowCount) return response.status(404).json({ error:'Department not found.' });
    return response.status(204).end();
  } catch (error) {
    if (error.code === '23503') return response.status(409).json({ error:'Move child units and employee assignments before deleting this unit.' });
    return next(error);
  }
});

organizationRouter.get('/positions', ...requirePermission('organization', 'view'), async (_request, response, next) => {
  try {
    await ensureOrganizationSchema();
    const result = await pool.query(
      `SELECT id, name, description, level, sort_order AS "sortOrder", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM organization_positions ORDER BY level, name`
    );
    return response.json({ positions:result.rows });
  } catch (error) { return next(error); }
});

organizationRouter.post('/positions', ...requirePermission('organization', 'create'), async (request, response, next) => {
  const position = departmentInput(request.body);
  position.level = Number(request.body?.level || 1);
  const validationError = validateDepartment(position)?.replaceAll('Department', 'Position').replaceAll('department', 'position');
  if (validationError) return response.status(400).json({ error:validationError });
  if (!Number.isInteger(position.level) || position.level < 1 || position.level > 100) return response.status(400).json({ error:'Position level must be between 1 and 100.' });
  try {
    await ensureOrganizationSchema();
    const result = await pool.query(
      `INSERT INTO organization_positions (name, description, level, sort_order)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM organization_positions))
       RETURNING id, name, description, level, sort_order AS "sortOrder", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [position.name, position.description, position.level]
    );
    return response.status(201).json({ position:result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error:'That position name is already in use.' });
    return next(error);
  }
});

organizationRouter.put('/positions/:id', ...requirePermission('organization', 'update'), async (request, response, next) => {
  if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error:'Invalid position ID.' });
  const position = departmentInput(request.body);
  position.level = Number(request.body?.level || 1);
  const validationError = validateDepartment(position)?.replaceAll('Department', 'Position').replaceAll('department', 'position');
  if (validationError) return response.status(400).json({ error:validationError });
  if (!Number.isInteger(position.level) || position.level < 1 || position.level > 100) return response.status(400).json({ error:'Position level must be between 1 and 100.' });
  try {
    await ensureOrganizationSchema();
    const result = await pool.query(
      `UPDATE organization_positions SET name=$1, description=$2, level=$3, updated_at=NOW()
       WHERE id=$4 RETURNING id, name, description, level, sort_order AS "sortOrder", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [position.name, position.description, position.level, request.params.id]
    );
    if (!result.rowCount) return response.status(404).json({ error:'Position not found.' });
    return response.json({ position:result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error:'That position name is already in use.' });
    return next(error);
  }
});

organizationRouter.delete('/positions/:id', ...requirePermission('organization', 'delete'), async (request, response, next) => {
  if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error:'Invalid position ID.' });
  try {
    await ensureOrganizationSchema();
    const result = await pool.query('DELETE FROM organization_positions WHERE id=$1 RETURNING id', [request.params.id]);
    if (!result.rowCount) return response.status(404).json({ error:'Position not found.' });
    return response.status(204).end();
  } catch (error) {
    if (error.code === '23503') return response.status(409).json({ error:'Reassign employees before deleting this position.' });
    return next(error);
  }
});

organizationRouter.put('/positions-order', ...requirePermission('organization', 'update'), async (request, response, next) => {
  const positionIds = Array.isArray(request.body?.positionIds) ? request.body.positionIds.map(String) : [];
  if (!positionIds.length || positionIds.some((id) => !isPositiveInteger(id)) || new Set(positionIds).size !== positionIds.length) {
    return response.status(400).json({ error:'A valid position order is required.' });
  }
  const client = await pool.connect();
  try {
    await ensureOrganizationSchema();
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM organization_positions WHERE id = ANY($1::bigint[])', [positionIds]);
    if (existing.rowCount !== positionIds.length) {
      await client.query('ROLLBACK');
      return response.status(400).json({ error:'One or more positions no longer exist.' });
    }
    for (const [index, id] of positionIds.entries()) {
      await client.query('UPDATE organization_positions SET sort_order=$1, updated_at=NOW() WHERE id=$2', [index + 1, id]);
    }
    await client.query('COMMIT');
    return response.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally { client.release(); }
});

organizationRouter.get('/assignments', ...requirePermission('organization', 'view'), async (_request, response, next) => {
  try {
    await ensureOrganizationSchema();
    const result = await pool.query(
      `SELECT employee.id AS "employeeId", employee.employee_number AS "employeeNumber",
              employee.first_name AS "firstName", employee.last_name AS "lastName",
              current_assignment."assignmentId", current_assignment."unitIds",
              current_assignment."positionId", current_assignment."managerEmployeeIds",
              current_assignment."effectiveFrom", current_assignment."unitNames",
              current_assignment."positionName", current_assignment."positionLevel",
              current_assignment."managerNames"
       FROM employee_profiles employee
       LEFT JOIN LATERAL (
         SELECT MIN(assignment.id) AS "assignmentId",
                ARRAY_AGG(DISTINCT assignment.unit_id::text) AS "unitIds",
                MIN(assignment.position_id) AS "positionId",
                MIN(assignment.effective_from) AS "effectiveFrom",
                STRING_AGG(DISTINCT unit.name, ', ' ORDER BY unit.name) AS "unitNames",
                MIN(position.name) AS "positionName", MIN(position.level) AS "positionLevel",
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT manager_link.manager_employee_id::text), NULL) AS "managerEmployeeIds",
                STRING_AGG(DISTINCT CONCAT(manager.first_name, ' ', manager.last_name), ', ' ORDER BY CONCAT(manager.first_name, ' ', manager.last_name)) AS "managerNames"
         FROM organization_assignments assignment
         JOIN organization_departments unit ON unit.id=assignment.unit_id
         JOIN organization_positions position ON position.id=assignment.position_id
         LEFT JOIN organization_assignment_managers manager_link ON manager_link.assignment_id=assignment.id
         LEFT JOIN employee_profiles manager ON manager.id=manager_link.manager_employee_id
         WHERE assignment.employee_id=employee.id
           AND assignment.effective_from<=CURRENT_DATE
           AND (assignment.effective_to IS NULL OR assignment.effective_to>=CURRENT_DATE)
       ) current_assignment ON TRUE
       WHERE employee.employment_status='active'
       ORDER BY employee.last_name, employee.first_name`
    );
    return response.json({ assignments:result.rows });
  } catch (error) { return next(error); }
});

organizationRouter.get('/assignments/:employeeId/history', ...requirePermission('organization', 'view'), async (request, response, next) => {
  if (!isPositiveInteger(request.params.employeeId)) return response.status(400).json({ error:'Invalid employee ID.' });
  try {
    await ensureOrganizationSchema();
    const result = await pool.query(
      `SELECT assignment.id, unit.name AS "unitName", position.name AS "positionName",
              assignment.effective_from AS "effectiveFrom", assignment.effective_to AS "effectiveTo",
              STRING_AGG(CONCAT(manager.first_name, ' ', manager.last_name), ', ' ORDER BY manager.last_name, manager.first_name) AS "managerName"
       FROM organization_assignments assignment
       JOIN organization_departments unit ON unit.id=assignment.unit_id
       JOIN organization_positions position ON position.id=assignment.position_id
       LEFT JOIN organization_assignment_managers manager_link ON manager_link.assignment_id=assignment.id
       LEFT JOIN employee_profiles manager ON manager.id=manager_link.manager_employee_id
       WHERE assignment.employee_id=$1
       GROUP BY assignment.id, unit.name, position.name
       ORDER BY assignment.effective_from DESC, assignment.id DESC`,
      [request.params.employeeId]
    );
    return response.json({ history:result.rows });
  } catch (error) { return next(error); }
});

organizationRouter.put('/assignments/:employeeId', ...requirePermission('organization', 'update'), async (request, response, next) => {
  if (!isPositiveInteger(request.params.employeeId)) return response.status(400).json({ error:'Invalid employee ID.' });
  const unitIds = [...new Set((Array.isArray(request.body?.unitIds) ? request.body.unitIds : [request.body?.unitId]).filter(Boolean).map(String))];
  const positionId = String(request.body?.positionId || '');
  const managerEmployeeIds = [...new Set((Array.isArray(request.body?.managerEmployeeIds) ? request.body.managerEmployeeIds : [request.body?.managerEmployeeId]).filter(Boolean).map(String))];
  const effectiveFrom = String(request.body?.effectiveFrom || '');
  if (!effectiveFrom || !isIsoDate(effectiveFrom)) return response.status(400).json({ error:'Select a valid effective date.' });
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await ensureOrganizationSchema();
    await client.query('BEGIN');
    transactionStarted = true;
    const assignment = await replaceCurrentOrganizationAssignment(client, {
      employeeId:request.params.employeeId,
      unitIds,
      positionId,
      managerEmployeeIds,
      effectiveFrom
    });
    await client.query('COMMIT');
    transactionStarted = false;
    return response.json({ assignment });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    return next(error);
  } finally { client.release(); }
});
