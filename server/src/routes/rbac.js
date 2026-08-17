import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requirePermission } from '../auth/authorization.js';
import { isPositiveInteger } from '../validation.js';

export const rbacRouter = Router();

rbacRouter.get('/modules', ...requirePermission('roles', 'view'), async (_request, response, next) => {
  try {
    const result = await pool.query(
      `SELECT id, module_key AS "moduleKey", name, description, sort_order AS "sortOrder"
       FROM modules WHERE is_active = TRUE ORDER BY sort_order, name`
    );
    response.json({ modules: result.rows });
  } catch (error) { next(error); }
});

rbacRouter.get('/roles', ...requirePermission('roles', 'view'), async (_request, response, next) => {
  try {
    const roles = await pool.query(
      `SELECT id, name, description, is_system AS "isSystem" FROM roles ORDER BY is_system DESC, name`
    );
    const permissions = await pool.query(
      `SELECT rp.role_id AS "roleId", m.module_key AS "moduleKey",
              rp.can_create AS create, rp.can_view AS view,
              rp.can_update AS update, rp.can_delete AS delete
       FROM role_permissions rp JOIN modules m ON m.id = rp.module_id ORDER BY m.sort_order`
    );
    response.json({ roles: roles.rows.map((role) => ({
      ...role,
      permissions: permissions.rows.filter((permission) => String(permission.roleId) === String(role.id))
    })) });
  } catch (error) { next(error); }
});

rbacRouter.post('/roles', ...requirePermission('roles', 'create'), async (request, response, next) => {
  try {
    const name = String(request.body?.name || '').trim();
    const description = String(request.body?.description || '').trim();
    if (!name) return response.status(400).json({ error: 'Role name is required.' });
    const result = await pool.query(
      `INSERT INTO roles (name, description) VALUES ($1, $2)
       RETURNING id, name, description, is_system AS "isSystem"`,
      [name, description]
    );
    response.status(201).json({ role: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'A role with that name already exists.' });
    next(error);
  }
});

rbacRouter.put('/roles/:id', ...requirePermission('roles', 'update'), async (request, response, next) => {
  try {
    if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error: 'Invalid role ID.' });
    const name = String(request.body?.name || '').trim();
    const description = String(request.body?.description || '').trim();
    if (!name) return response.status(400).json({ error: 'Role name is required.' });
    const result = await pool.query(
      `UPDATE roles SET name = $1, description = $2, updated_at = NOW()
       WHERE id = $3 AND is_system = FALSE
       RETURNING id, name, description, is_system AS "isSystem"`,
      [name, description, request.params.id]
    );
    if (!result.rows[0]) return response.status(400).json({ error: 'System roles cannot be renamed.' });
    response.json({ role: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'A role with that name already exists.' });
    next(error);
  }
});

rbacRouter.put('/roles/:id/permissions', ...requirePermission('roles', 'update'), async (request, response, next) => {
  if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error: 'Invalid role ID.' });
  const client = await pool.connect();
  try {
    const roleResult = await client.query('SELECT is_system, name FROM roles WHERE id = $1', [request.params.id]);
    if (!roleResult.rows[0]) return response.status(404).json({ error: 'Role not found.' });
    if (roleResult.rows[0].name === 'Administrator') return response.status(400).json({ error: 'Administrator always has full access.' });
    const permissions = Array.isArray(request.body?.permissions) ? request.body.permissions : [];
    await client.query('BEGIN');
    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [request.params.id]);
    for (const item of permissions) {
      await client.query(
        `INSERT INTO role_permissions (role_id, module_id, can_create, can_view, can_update, can_delete)
         SELECT $1, id, $3, $4, $5, $6 FROM modules WHERE module_key = $2 AND is_active = TRUE`,
        [request.params.id, item.moduleKey, Boolean(item.create), Boolean(item.view), Boolean(item.update), Boolean(item.delete)]
      );
    }
    await client.query('COMMIT');
    response.json({ message: 'Permissions updated.' });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});

rbacRouter.delete('/roles/:id', ...requirePermission('roles', 'delete'), async (request, response, next) => {
  try {
    if (!isPositiveInteger(request.params.id)) return response.status(400).json({ error: 'Invalid role ID.' });
    const result = await pool.query('DELETE FROM roles WHERE id = $1 AND is_system = FALSE RETURNING id', [request.params.id]);
    if (!result.rows[0]) return response.status(400).json({ error: 'System roles cannot be deleted.' });
    response.status(204).end();
  } catch (error) {
    if (error.code === '23503') return response.status(409).json({ error: 'Reassign users before deleting this role.' });
    next(error);
  }
});
