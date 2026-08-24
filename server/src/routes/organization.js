import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requirePermission } from '../auth/authorization.js';
import { isIsoDate, isPositiveInteger } from '../validation.js';

export const organizationRouter = Router();

export async function ensureOrganizationSchema() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS organization_departments (
       id BIGSERIAL PRIMARY KEY,
       name TEXT NOT NULL UNIQUE,
       description TEXT NOT NULL DEFAULT '',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query('CREATE INDEX IF NOT EXISTS organization_departments_name_idx ON organization_departments (name)');
  await pool.query('ALTER TABLE organization_departments ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES organization_departments(id) ON DELETE RESTRICT');
  await pool.query("ALTER TABLE organization_departments ADD COLUMN IF NOT EXISTS unit_type TEXT NOT NULL DEFAULT 'department'");
  await pool.query('CREATE INDEX IF NOT EXISTS organization_departments_parent_idx ON organization_departments (parent_id)');
  await pool.query(
    `INSERT INTO organization_departments (name) VALUES
       ('Executive Management'),
       ('Human Resources'),
       ('Finance and Accounting'),
       ('Operations'),
       ('Information Technology'),
       ('Sales'),
       ('Marketing'),
       ('Customer Service')
     ON CONFLICT (name) DO NOTHING`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS organization_positions (
       id BIGSERIAL PRIMARY KEY,
       name TEXT NOT NULL UNIQUE,
       description TEXT NOT NULL DEFAULT '',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  await pool.query('CREATE INDEX IF NOT EXISTS organization_positions_name_idx ON organization_positions (name)');
  await pool.query('ALTER TABLE organization_positions ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0');
  await pool.query('ALTER TABLE organization_positions ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1');
  await pool.query(
    `INSERT INTO organization_positions (name) VALUES
       ('Rank and File'),
       ('Department Supervisor'),
       ('Department Manager'),
       ('Area Manager'),
       ('Senior Manager'),
       ('Vice President'),
       ('President'),
       ('Chief Executive Officer')
     ON CONFLICT (name) DO NOTHING`
  );
  await pool.query(
    `WITH ranked AS (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS position_order FROM organization_positions)
     UPDATE organization_positions position SET sort_order=ranked.position_order
     FROM ranked WHERE ranked.id=position.id AND position.sort_order=0`
  );
  await pool.query(
    `WITH position_scale AS (SELECT COALESCE(MAX(sort_order),1) AS maximum FROM organization_positions)
     UPDATE organization_positions position
     SET level=position_scale.maximum + 1 - position.sort_order
     FROM position_scale
     WHERE position.sort_order>0
       AND (
         NOT EXISTS (SELECT 1 FROM organization_positions WHERE level<>1)
         OR NOT EXISTS (SELECT 1 FROM organization_positions WHERE level<>sort_order)
       )`
  );
  await pool.query(
    `UPDATE organization_positions
     SET level = CASE name
       WHEN 'Chief Executive Officer' THEN 1
       WHEN 'President' THEN 2
       WHEN 'Vice President' THEN 3
       WHEN 'Senior Manager' THEN 4
       WHEN 'Area Manager' THEN 5
       WHEN 'Department Manager' THEN 6
       WHEN 'Department Supervisor' THEN 7
       WHEN 'Rank and File' THEN 8
       ELSE level END
     WHERE name IN ('Chief Executive Officer','President','Vice President','Senior Manager',
                    'Area Manager','Department Manager','Department Supervisor','Rank and File')`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS organization_assignments (
       id BIGSERIAL PRIMARY KEY,
       employee_id BIGINT NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
       unit_id BIGINT NOT NULL REFERENCES organization_departments(id) ON DELETE RESTRICT,
       position_id BIGINT NOT NULL REFERENCES organization_positions(id) ON DELETE RESTRICT,
       manager_employee_id BIGINT REFERENCES employee_profiles(id) ON DELETE RESTRICT,
       effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
       effective_to DATE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       CHECK (manager_employee_id IS NULL OR manager_employee_id <> employee_id),
       CHECK (effective_to IS NULL OR effective_to >= effective_from)
     )`
  );
  await pool.query('DROP INDEX IF EXISTS organization_assignments_one_current_idx');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS organization_assignments_one_current_unit_idx ON organization_assignments (employee_id, unit_id) WHERE effective_to IS NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS organization_assignments_unit_idx ON organization_assignments (unit_id) WHERE effective_to IS NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS organization_assignments_manager_idx ON organization_assignments (manager_employee_id) WHERE effective_to IS NULL');
  await pool.query(`CREATE TABLE IF NOT EXISTS organization_assignment_managers (
    assignment_id BIGINT NOT NULL REFERENCES organization_assignments(id) ON DELETE CASCADE,
    manager_employee_id BIGINT NOT NULL REFERENCES employee_profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (assignment_id, manager_employee_id)
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS organization_assignment_managers_manager_idx ON organization_assignment_managers (manager_employee_id)');
  await pool.query(`INSERT INTO organization_assignment_managers (assignment_id, manager_employee_id)
    SELECT id, manager_employee_id FROM organization_assignments WHERE manager_employee_id IS NOT NULL ON CONFLICT DO NOTHING`);
  await pool.query(
    `INSERT INTO organization_assignments (employee_id, unit_id, position_id, effective_from)
     SELECT employee.id, unit.id, position.id, COALESCE(employee.hire_date, CURRENT_DATE)
     FROM employee_profiles employee
     JOIN organization_departments unit ON LOWER(unit.name)=LOWER(NULLIF(TRIM(employee.department), ''))
     JOIN organization_positions position ON LOWER(position.name)=LOWER(NULLIF(TRIM(employee.job_title), ''))
     WHERE NOT EXISTS (
       SELECT 1 FROM organization_assignments assignment
       WHERE assignment.employee_id=employee.id AND assignment.effective_to IS NULL
     )
     ON CONFLICT DO NOTHING`
  );
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
              COUNT(assignment.id)::INTEGER AS "memberCount",
              unit.created_at AS "createdAt", unit.updated_at AS "updatedAt"
       FROM organization_departments unit
       LEFT JOIN organization_assignments assignment ON assignment.unit_id=unit.id AND assignment.effective_to IS NULL
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
         WHERE assignment.employee_id=employee.id AND assignment.effective_to IS NULL
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
  if (!unitIds.length || unitIds.some((id)=>!isPositiveInteger(id)) || !isPositiveInteger(positionId)) return response.status(400).json({ error:'Select at least one valid team and a position.' });
  if (managerEmployeeIds.some((id)=>!isPositiveInteger(id))) return response.status(400).json({ error:'Select valid direct managers.' });
  if (managerEmployeeIds.includes(String(request.params.employeeId))) return response.status(400).json({ error:'An employee cannot report to themselves.' });
  if (!isIsoDate(effectiveFrom)) return response.status(400).json({ error:'Select a valid effective date.' });
  const client = await pool.connect();
  try {
    await ensureOrganizationSchema();
    await client.query('BEGIN');
    const [employee, units, position] = await Promise.all([
      client.query("SELECT id FROM employee_profiles WHERE id=$1 AND employment_status='active'", [request.params.employeeId]),
      client.query('SELECT id, name FROM organization_departments WHERE id=ANY($1::bigint[]) ORDER BY name', [unitIds]),
      client.query('SELECT id, name, level FROM organization_positions WHERE id=$1', [positionId])
    ]);
    if (!employee.rowCount || units.rowCount!==unitIds.length || !position.rowCount) {
      await client.query('ROLLBACK');
      return response.status(400).json({ error:'The employee, one of the teams, or the position is no longer available.' });
    }
    if (managerEmployeeIds.length) {
      const managers = await client.query(
        `SELECT assignment.employee_id::text AS id, MIN(position.level) AS level
         FROM organization_assignments assignment
         JOIN organization_positions position ON position.id=assignment.position_id
         JOIN employee_profiles employee ON employee.id=assignment.employee_id AND employee.employment_status='active'
         WHERE assignment.employee_id=ANY($1::bigint[]) AND assignment.effective_to IS NULL
         GROUP BY assignment.employee_id`, [managerEmployeeIds]
      );
      if (managers.rowCount!==managerEmployeeIds.length) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error:'Every selected manager needs an active organization assignment.' });
      }
      if (managers.rows.some((manager)=>Number(manager.level)>=Number(position.rows[0].level))) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error:'Every direct manager must hold a more senior position level.' });
      }
      const cycle = await client.query(
        `WITH RECURSIVE reporting_chain(employee_id) AS (
           SELECT UNNEST($1::bigint[])
           UNION
           SELECT manager_link.manager_employee_id
           FROM reporting_chain chain
           JOIN organization_assignments assignment ON assignment.employee_id=chain.employee_id AND assignment.effective_to IS NULL
           JOIN organization_assignment_managers manager_link ON manager_link.assignment_id=assignment.id
         ) SELECT 1 FROM reporting_chain WHERE employee_id=$2 LIMIT 1`,
        [managerEmployeeIds, request.params.employeeId]
      );
      if (cycle.rowCount) {
        await client.query('ROLLBACK');
        return response.status(400).json({ error:'Those manager selections would create a circular reporting line.' });
      }
    }
    const current = await client.query('SELECT id, effective_from::text FROM organization_assignments WHERE employee_id=$1 AND effective_to IS NULL FOR UPDATE', [request.params.employeeId]);
    for (const assignment of current.rows) {
      if (String(assignment.effective_from).slice(0,10)>=effectiveFrom) await client.query('DELETE FROM organization_assignments WHERE id=$1', [assignment.id]);
      else await client.query("UPDATE organization_assignments SET effective_to=$1::date-1, updated_at=NOW() WHERE id=$2", [effectiveFrom, assignment.id]);
    }
    const primaryManagerId = managerEmployeeIds[0] || null;
    const assignmentIds = [];
    for (const unitId of unitIds) {
      const inserted = await client.query(
        `INSERT INTO organization_assignments (employee_id, unit_id, position_id, manager_employee_id, effective_from)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [request.params.employeeId, unitId, positionId, primaryManagerId, effectiveFrom]
      );
      assignmentIds.push(inserted.rows[0].id);
      for (const managerId of managerEmployeeIds) {
        await client.query('INSERT INTO organization_assignment_managers (assignment_id, manager_employee_id) VALUES ($1,$2)', [inserted.rows[0].id, managerId]);
      }
    }
    const departmentNames = units.rows.map((unit)=>unit.name).join(', ');
    await client.query('UPDATE employee_profiles SET department=$1, job_title=$2, updated_at=NOW() WHERE id=$3', [departmentNames, position.rows[0].name, request.params.employeeId]);
    await client.query(
      `UPDATE employee_leave_requests
       SET approver_employee_id=$1, routed_at=CASE WHEN $1::bigint IS NULL THEN NULL ELSE NOW() END, updated_at=NOW()
       WHERE employee_id=$2 AND status='pending'`,
      [primaryManagerId, request.params.employeeId]
    );
    await client.query('COMMIT');
    return response.json({ assignment:{ employeeId:request.params.employeeId, assignmentIds, unitIds, positionId, managerEmployeeIds, effectiveFrom } });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally { client.release(); }
});
