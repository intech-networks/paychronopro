import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requirePermission } from '../auth/authorization.js';
import { isPositiveInteger } from '../validation.js';

export const departmentsRouter = Router();

function departmentInput(body = {}) {
  const managerId = body.managerId ? String(body.managerId) : null;
  const assistantManagerId = body.assistantManagerId ? String(body.assistantManagerId) : null;
  const memberIds = Array.isArray(body.memberIds) ? [...new Set(body.memberIds.map(String).filter(Boolean))] : [];
  return {
    name: String(body.name || '').trim(),
    description: String(body.description || '').trim(),
    managerId,
    assistantManagerId,
    memberIds
  };
}

function validateDepartment(input) {
  if (!input.name) return 'Department name is required.';
  if (input.name.length > 120 || input.description.length > 1000) return 'Department details are too long.';
  const employeeIds = [input.managerId, input.assistantManagerId, ...input.memberIds].filter(Boolean);
  if (employeeIds.some((id) => !isPositiveInteger(id))) return 'One or more employee assignments are invalid.';
  if (new Set(employeeIds).size !== employeeIds.length) return 'An employee can only hold one position in a department.';
  return null;
}

async function loadDepartments(database, departmentId = null) {
  const departmentResult = await database.query(
    `SELECT id, name, description, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM departments WHERE $1::bigint IS NULL OR id = $1 ORDER BY name`,
    [departmentId]
  );
  if (!departmentResult.rowCount) return [];
  const assignmentResult = await database.query(
    `SELECT da.department_id AS "departmentId", da.assignment_role AS "assignmentRole",
            ep.id, ep.employee_number AS "employeeNumber", ep.first_name AS "firstName",
            ep.last_name AS "lastName", ep.preferred_name AS "preferredName",
            ep.email, ep.job_title AS "jobTitle"
     FROM department_assignments da
     JOIN employee_profiles ep ON ep.id = da.employee_id
     WHERE da.department_id = ANY($1::bigint[])
     ORDER BY ep.last_name, ep.first_name`,
    [departmentResult.rows.map((department) => department.id)]
  );
  return departmentResult.rows.map((department) => {
    const assignments = assignmentResult.rows.filter((assignment) => String(assignment.departmentId) === String(department.id));
    const cleanEmployee = ({ assignmentRole, departmentId: _departmentId, ...employee }) => employee;
    return {
      ...department,
      manager: assignments.find((assignment) => assignment.assignmentRole === 'manager') ? cleanEmployee(assignments.find((assignment) => assignment.assignmentRole === 'manager')) : null,
      assistantManager: assignments.find((assignment) => assignment.assignmentRole === 'assistant_manager') ? cleanEmployee(assignments.find((assignment) => assignment.assignmentRole === 'assistant_manager')) : null,
      teamMembers: assignments.filter((assignment) => assignment.assignmentRole === 'member').map(cleanEmployee)
    };
  });
}

async function validateEmployees(database, input) {
  const employeeIds = [input.managerId, input.assistantManagerId, ...input.memberIds].filter(Boolean);
  if (!employeeIds.length) return null;
  const result = await database.query('SELECT id FROM employee_profiles WHERE id = ANY($1::bigint[])', [employeeIds]);
  return result.rowCount === employeeIds.length ? null : 'One or more selected employees no longer exist.';
}

async function replaceAssignments(client, department, input) {
  const selectedIds = [input.managerId, input.assistantManagerId, ...input.memberIds].filter(Boolean);
  const previousResult = await client.query(
    `SELECT employee_id FROM department_assignments
     WHERE department_id = $1 OR employee_id = ANY($2::bigint[])`,
    [department.id, selectedIds]
  );
  const affectedIds = [...new Set([...previousResult.rows.map((row) => String(row.employee_id)), ...selectedIds])];
  await client.query(
    `DELETE FROM department_assignments
     WHERE department_id = $1 OR employee_id = ANY($2::bigint[])`,
    [department.id, selectedIds]
  );
  const assignments = [
    input.managerId && [input.managerId, 'manager'],
    input.assistantManagerId && [input.assistantManagerId, 'assistant_manager'],
    ...input.memberIds.map((employeeId) => [employeeId, 'member'])
  ].filter(Boolean);
  for (const [employeeId, assignmentRole] of assignments) {
    await client.query(
      'INSERT INTO department_assignments (department_id, employee_id, assignment_role) VALUES ($1,$2,$3)',
      [department.id, employeeId, assignmentRole]
    );
  }
  if (affectedIds.length) {
    await client.query("UPDATE employee_profiles SET department = '', updated_at = NOW() WHERE id = ANY($1::bigint[])", [affectedIds]);
  }
  if (selectedIds.length) {
    await client.query('UPDATE employee_profiles SET department = $1, updated_at = NOW() WHERE id = ANY($2::bigint[])', [department.name, selectedIds]);
  }
}

function handleDepartmentError(error, response, next) {
  if (error.code === '23505') return response.status(409).json({ error: 'That department name is already in use.' });
  return next(error);
}

departmentsRouter.get('/employees', ...requirePermission('departments', 'view'), async (_request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT id, employee_number AS "employeeNumber", first_name AS "firstName",
              last_name AS "lastName", preferred_name AS "preferredName", email,
              job_title AS "jobTitle", department, employment_status AS "employmentStatus"
       FROM employee_profiles ORDER BY last_name, first_name`
    );
    response.json({ employees: result.rows });
  } catch (error) { next(error); }
});

departmentsRouter.get('/', ...requirePermission('departments', 'view'), async (_request, response, next) => {
  try { response.json({ departments: await loadDepartments(pool) }); } catch (error) { next(error); }
});

departmentsRouter.get('/:id', ...requirePermission('departments', 'view'), async (request, response, next) => {
  try {
    if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error: 'Invalid department ID.' });
    const department = (await loadDepartments(pool, request.params.id))[0];
    if (!department) return response.status(404).json({ error: 'Department not found.' });
    response.json({ department });
  } catch (error) { next(error); }
});

departmentsRouter.post('/', ...requirePermission('departments', 'create'), async (request, response, next) => {
  const input = departmentInput(request.body);
  const validationError = validateDepartment(input);
  if (validationError) return response.status(400).json({ error: validationError });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const employeeError = await validateEmployees(client, input);
    if (employeeError) { await client.query('ROLLBACK'); return response.status(400).json({ error: employeeError }); }
    const result = await client.query('INSERT INTO departments (name, description) VALUES ($1,$2) RETURNING id, name', [input.name, input.description]);
    await replaceAssignments(client, result.rows[0], input);
    await client.query('COMMIT');
    response.status(201).json({ department: (await loadDepartments(pool, result.rows[0].id))[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    handleDepartmentError(error, response, next);
  } finally { client.release(); }
});

departmentsRouter.put('/:id', ...requirePermission('departments', 'update'), async (request, response, next) => {
  if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error: 'Invalid department ID.' });
  const input = departmentInput(request.body);
  const validationError = validateDepartment(input);
  if (validationError) return response.status(400).json({ error: validationError });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const employeeError = await validateEmployees(client, input);
    if (employeeError) { await client.query('ROLLBACK'); return response.status(400).json({ error: employeeError }); }
    const result = await client.query(
      'UPDATE departments SET name=$1, description=$2, updated_at=NOW() WHERE id=$3 RETURNING id, name',
      [input.name, input.description, request.params.id]
    );
    if (!result.rows[0]) { await client.query('ROLLBACK'); return response.status(404).json({ error: 'Department not found.' }); }
    await replaceAssignments(client, result.rows[0], input);
    await client.query('COMMIT');
    response.json({ department: (await loadDepartments(pool, request.params.id))[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    handleDepartmentError(error, response, next);
  } finally { client.release(); }
});

departmentsRouter.delete('/:id', ...requirePermission('departments', 'delete'), async (request, response, next) => {
  if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error: 'Invalid department ID.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const assignments = await client.query('SELECT employee_id FROM department_assignments WHERE department_id = $1', [request.params.id]);
    const result = await client.query('DELETE FROM departments WHERE id = $1 RETURNING id', [request.params.id]);
    if (!result.rows[0]) { await client.query('ROLLBACK'); return response.status(404).json({ error: 'Department not found.' }); }
    if (assignments.rowCount) {
      await client.query("UPDATE employee_profiles SET department='', updated_at=NOW() WHERE id = ANY($1::bigint[])", [assignments.rows.map((row) => row.employee_id)]);
    }
    await client.query('COMMIT');
    response.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});
