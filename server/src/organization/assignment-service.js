import { isIsoDate, isPositiveInteger } from '../validation.js';

function requestError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function normalizeIds(value) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.filter(Boolean).map(String))];
}

export async function getCurrentOrganizationAssignment(client, employeeId) {
  const result = await client.query(
    `SELECT COUNT(DISTINCT assignment.id)::integer AS "assignmentCount",
            COALESCE(ARRAY_AGG(DISTINCT assignment.unit_id::text ORDER BY assignment.unit_id::text), ARRAY[]::text[]) AS "departmentIds",
            MIN(assignment.position_id)::text AS "positionId",
            MIN(assignment.effective_from)::text AS "effectiveFrom",
            COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT manager_link.manager_employee_id::text), NULL), ARRAY[]::text[]) AS "managerEmployeeIds",
            STRING_AGG(DISTINCT unit.name, ', ' ORDER BY unit.name) AS "departmentNames",
            MIN(position.name) AS "positionName"
     FROM organization_assignments assignment
     JOIN organization_departments unit ON unit.id = assignment.unit_id
     JOIN organization_positions position ON position.id = assignment.position_id
     LEFT JOIN organization_assignment_managers manager_link ON manager_link.assignment_id = assignment.id
     WHERE assignment.employee_id = $1
       AND assignment.effective_from <= CURRENT_DATE
       AND (assignment.effective_to IS NULL OR assignment.effective_to >= CURRENT_DATE)`,
    [employeeId]
  );
  return result.rows[0] || {
    assignmentCount:0,
    departmentIds:[],
    positionId:null,
    effectiveFrom:null,
    managerEmployeeIds:[],
    departmentNames:null,
    positionName:null
  };
}

export async function replaceCurrentOrganizationAssignment(client, {
  employeeId,
  unitIds,
  positionId,
  managerEmployeeIds = [],
  effectiveFrom: requestedEffectiveFrom
}) {
  const normalizedEmployeeId = String(employeeId || '');
  const normalizedUnitIds = normalizeIds(unitIds);
  const normalizedPositionId = String(positionId || '');
  const normalizedManagerIds = normalizeIds(managerEmployeeIds);

  if (!isPositiveInteger(normalizedEmployeeId) || !normalizedUnitIds.length
    || normalizedUnitIds.some((id) => !isPositiveInteger(id)) || !isPositiveInteger(normalizedPositionId)) {
    throw requestError('Select at least one valid department and a position.');
  }
  if (normalizedManagerIds.some((id) => !isPositiveInteger(id))) {
    throw requestError('Select valid direct managers.');
  }
  if (normalizedManagerIds.includes(normalizedEmployeeId)) {
    throw requestError('An employee cannot report to themselves.');
  }

  const dateResult = await client.query('SELECT CURRENT_DATE::text AS date');
  const currentDate = String(dateResult.rows[0].date).slice(0, 10);
  const effectiveFrom = String(requestedEffectiveFrom || currentDate);
  if (!isIsoDate(effectiveFrom)) throw requestError('Select a valid effective date.');
  if (effectiveFrom < currentDate) {
    throw requestError('Past effective dates cannot be changed. Create a current or future assignment instead.');
  }

  const employee = await client.query(
    "SELECT id FROM employee_profiles WHERE id=$1 AND employment_status='active'",
    [normalizedEmployeeId]
  );
  const units = await client.query(
    'SELECT id, name FROM organization_departments WHERE id=ANY($1::bigint[]) ORDER BY name',
    [normalizedUnitIds]
  );
  const position = await client.query(
    'SELECT id, name, level FROM organization_positions WHERE id=$1',
    [normalizedPositionId]
  );
  if (!employee.rowCount || units.rowCount !== normalizedUnitIds.length || !position.rowCount) {
    throw requestError('The employee, one of the departments, or the position is no longer available.');
  }

  if (normalizedManagerIds.length) {
    const managers = await client.query(
      `SELECT assignment.employee_id::text AS id, MIN(position.level) AS level
       FROM organization_assignments assignment
       JOIN organization_positions position ON position.id = assignment.position_id
       JOIN employee_profiles employee ON employee.id = assignment.employee_id AND employee.employment_status = 'active'
       WHERE assignment.employee_id = ANY($1::bigint[])
         AND assignment.effective_from <= $2::date
         AND (assignment.effective_to IS NULL OR assignment.effective_to >= $2::date)
       GROUP BY assignment.employee_id`,
      [normalizedManagerIds, effectiveFrom]
    );
    if (managers.rowCount !== normalizedManagerIds.length) {
      throw requestError('Every selected manager needs an organization assignment active on the effective date.');
    }
    if (managers.rows.some((manager) => Number(manager.level) >= Number(position.rows[0].level))) {
      throw requestError('Every direct manager must hold a more senior position level.');
    }
    const cycle = await client.query(
      `WITH RECURSIVE reporting_chain(employee_id) AS (
         SELECT UNNEST($1::bigint[])
         UNION
         SELECT manager_link.manager_employee_id
         FROM reporting_chain chain
         JOIN organization_assignments assignment
           ON assignment.employee_id = chain.employee_id
           AND assignment.effective_from <= $3::date
           AND (assignment.effective_to IS NULL OR assignment.effective_to >= $3::date)
         JOIN organization_assignment_managers manager_link ON manager_link.assignment_id = assignment.id
       ) SELECT 1 FROM reporting_chain WHERE employee_id = $2 LIMIT 1`,
      [normalizedManagerIds, normalizedEmployeeId, effectiveFrom]
    );
    if (cycle.rowCount) throw requestError('Those manager selections would create a circular reporting line.');
  }

  const futureAssignments = await client.query(
    'SELECT id FROM organization_assignments WHERE employee_id=$1 AND effective_from>$2::date FOR UPDATE',
    [normalizedEmployeeId, effectiveFrom]
  );
  if (futureAssignments.rowCount) {
    throw requestError('A later organization assignment is already scheduled. Update or remove it before changing this effective date.', 409);
  }

  const activeAssignments = await client.query(
    `SELECT id, effective_from::text FROM organization_assignments
     WHERE employee_id=$1
       AND effective_from <= $2::date
       AND (effective_to IS NULL OR effective_to >= $2::date)
     FOR UPDATE`,
    [normalizedEmployeeId, effectiveFrom]
  );
  for (const assignment of activeAssignments.rows) {
    if (String(assignment.effective_from).slice(0, 10) === effectiveFrom) {
      await client.query('DELETE FROM organization_assignments WHERE id=$1', [assignment.id]);
    } else {
      await client.query("UPDATE organization_assignments SET effective_to=$1::date-1, updated_at=NOW() WHERE id=$2", [effectiveFrom, assignment.id]);
    }
  }

  const primaryManagerId = normalizedManagerIds[0] || null;
  const assignmentIds = [];
  for (const unitId of normalizedUnitIds) {
    const inserted = await client.query(
      `INSERT INTO organization_assignments (employee_id, unit_id, position_id, manager_employee_id, effective_from)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [normalizedEmployeeId, unitId, normalizedPositionId, primaryManagerId, effectiveFrom]
    );
    assignmentIds.push(inserted.rows[0].id);
    for (const managerId of normalizedManagerIds) {
      await client.query(
        'INSERT INTO organization_assignment_managers (assignment_id, manager_employee_id) VALUES ($1,$2)',
        [inserted.rows[0].id, managerId]
      );
    }
  }

  if (effectiveFrom === currentDate) {
    const departmentNames = units.rows.map((unit) => unit.name).join(', ');
    await client.query(
      'UPDATE employee_profiles SET department=$1, job_title=$2, updated_at=NOW() WHERE id=$3',
      [departmentNames, position.rows[0].name, normalizedEmployeeId]
    );
    await client.query(
      `UPDATE employee_leave_requests
       SET approver_employee_id=$1, routed_at=CASE WHEN $1::bigint IS NULL THEN NULL ELSE NOW() END, updated_at=NOW()
       WHERE employee_id=$2 AND status='pending'`,
      [primaryManagerId, normalizedEmployeeId]
    );
  }

  return {
    employeeId:normalizedEmployeeId,
    assignmentIds,
    unitIds:normalizedUnitIds,
    positionId:normalizedPositionId,
    managerEmployeeIds:normalizedManagerIds,
    effectiveFrom
  };
}

export async function deactivateEmployeeOrganization(client, employeeId) {
  const normalizedEmployeeId = String(employeeId || '');
  if (!isPositiveInteger(normalizedEmployeeId)) throw requestError('Select a valid employee.');

  await client.query(
    `SELECT assignment.id
     FROM organization_assignments assignment
     WHERE (assignment.employee_id=$1 OR assignment.manager_employee_id=$1
       OR EXISTS (
         SELECT 1 FROM organization_assignment_managers manager_link
         WHERE manager_link.assignment_id=assignment.id AND manager_link.manager_employee_id=$1
       ))
       AND (assignment.effective_to IS NULL OR assignment.effective_to>=CURRENT_DATE)
     FOR UPDATE`,
    [normalizedEmployeeId]
  );

  await client.query(
    `DELETE FROM organization_assignment_managers manager_link
     USING organization_assignments assignment
     WHERE manager_link.assignment_id=assignment.id
       AND manager_link.manager_employee_id=$1
       AND (assignment.effective_to IS NULL OR assignment.effective_to>=CURRENT_DATE)`,
    [normalizedEmployeeId]
  );
  await client.query(
    `UPDATE organization_assignments assignment
     SET manager_employee_id=(
           SELECT MIN(manager_link.manager_employee_id)
           FROM organization_assignment_managers manager_link
           WHERE manager_link.assignment_id=assignment.id
         ),
         updated_at=NOW()
     WHERE assignment.manager_employee_id=$1
       AND (assignment.effective_to IS NULL OR assignment.effective_to>=CURRENT_DATE)`,
    [normalizedEmployeeId]
  );

  await client.query(
    `DELETE FROM organization_assignments
     WHERE employee_id=$1 AND effective_from>=CURRENT_DATE`,
    [normalizedEmployeeId]
  );
  await client.query(
    `UPDATE organization_assignments
     SET effective_to=CURRENT_DATE-1, updated_at=NOW()
     WHERE employee_id=$1
       AND effective_from<CURRENT_DATE
       AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)`,
    [normalizedEmployeeId]
  );
  await client.query(
    `UPDATE employee_leave_requests
     SET approver_employee_id=NULL, routed_at=NULL, updated_at=NOW()
     WHERE status='pending' AND (employee_id=$1 OR approver_employee_id=$1)`,
    [normalizedEmployeeId]
  );
  await client.query(
    "UPDATE employee_profiles SET department='', job_title='', updated_at=NOW() WHERE id=$1",
    [normalizedEmployeeId]
  );
}
