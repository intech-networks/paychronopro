import { pool } from '../db/pool.js';

export const parentModuleByChild = {
  workforce: 'maintenance',
  leave_management: 'maintenance',
  departments: 'maintenance',
  roles: 'maintenance',
  time_entries: 'time_tracking',
  shift_management: 'time_tracking',
  requests: 'time_tracking',
  leave_application: 'time_tracking',
  overtime_request: 'time_tracking',
  shift_change: 'time_tracking',
  scheduler: 'utilities',
  device_users: 'utilities'
};

const permissionOperations = ['create', 'view', 'update', 'delete'];

export function normalizePermissionHierarchy(permissions) {
  const normalized = new Map(permissions.map((permission) => [permission.moduleKey, { ...permission }]));
  for (const [childKey, parentKey] of Object.entries(parentModuleByChild)) {
    const child = normalized.get(childKey);
    if (!child) continue;
    const parent = normalized.get(parentKey) || { moduleKey:parentKey };
    for (const operation of permissionOperations) {
      parent[operation] = Boolean(parent[operation] || child[operation]);
    }
    normalized.set(parentKey, parent);
  }
  return [...normalized.values()];
}

export function hasPermission(user, moduleKey, operation) {
  const permission = user.permissions.find((item) => item.moduleKey === moduleKey);
  if (!permission?.[operation]) return false;
  const parentKey = parentModuleByChild[moduleKey];
  if (!parentKey) return true;
  const parentPermission = user.permissions.find((item) => item.moduleKey === parentKey);
  return Boolean(parentPermission?.[operation]);
}

export async function getSessionUser(userId) {
  const userResult = await pool.query(
    `SELECT u.id, u.email, u.display_name, r.id AS role_id, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.is_active = TRUE LIMIT 1`,
    [userId]
  );
  const row = userResult.rows[0];
  if (!row) return null;

  const permissionResult = await pool.query(
    `SELECT m.module_key, m.name, rp.can_create, rp.can_view, rp.can_update, rp.can_delete
     FROM role_permissions rp JOIN modules m ON m.id = rp.module_id
     WHERE rp.role_id = $1 AND m.is_active = TRUE ORDER BY m.sort_order, m.name`,
    [row.role_id]
  );

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role_name,
    roleId: row.role_id,
    permissions: permissionResult.rows.map((permission) => ({
      moduleKey: permission.module_key,
      moduleName: permission.name,
      create: permission.can_create,
      view: permission.can_view,
      update: permission.can_update,
      delete: permission.can_delete
    }))
  };
}

export async function requireAuth(request, response, next) {
  try {
    if (!request.session.userId) return response.status(401).json({ error: 'Not authenticated.' });
    const user = await getSessionUser(request.session.userId);
    if (!user) return response.status(401).json({ error: 'Not authenticated.' });
    request.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requirePermission(moduleKey, operation) {
  return [requireAuth, (request, response, next) => {
    if (!hasPermission(request.user, moduleKey, operation)) {
      return response.status(403).json({ error: `You do not have permission to ${operation} ${moduleKey}.` });
    }
    return next();
  }];
}

export function requireAnyPermission(moduleKey, operations) {
  return [requireAuth, (request, response, next) => {
    if (!operations.some((operation) => hasPermission(request.user, moduleKey, operation))) {
      return response.status(403).json({ error: `You do not have permission to modify ${moduleKey}.` });
    }
    return next();
  }];
}
