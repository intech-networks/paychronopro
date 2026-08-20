import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission, normalizePermissionHierarchy, parentModuleByChild } from '../src/auth/authorization.js';

function userWith(...permissions) {
  return { permissions: permissions.map(([moduleKey, operations]) => ({ moduleKey, ...operations })) };
}

test('defines every parent and child module relationship', () => {
  assert.deepEqual(parentModuleByChild, {
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
  });
});

test('child access requires the same operation on its parent', () => {
  const childOnly = userWith(['shift_management', { view:true, update:true }]);
  assert.equal(hasPermission(childOnly, 'shift_management', 'view'), false);
  assert.equal(hasPermission(childOnly, 'shift_management', 'update'), false);

  const parentAndChild = userWith(
    ['time_tracking', { view:true, update:false }],
    ['shift_management', { view:true, update:true }]
  );
  assert.equal(hasPermission(parentAndChild, 'shift_management', 'view'), true);
  assert.equal(hasPermission(parentAndChild, 'shift_management', 'update'), false);
});

test('top-level module access remains independently enforceable', () => {
  const user = userWith(['payroll', { view:true, update:false }]);
  assert.equal(hasPermission(user, 'payroll', 'view'), true);
  assert.equal(hasPermission(user, 'payroll', 'update'), false);
});

test('normalizes enabled child operations onto their parent', () => {
  const normalized = normalizePermissionHierarchy([
    { moduleKey:'time_tracking', create:false, view:false, update:false, delete:false },
    { moduleKey:'time_entries', create:true, view:true, update:true, delete:false },
    { moduleKey:'requests', create:false, view:true, update:true, delete:true }
  ]);
  const parent = normalized.find((permission) => permission.moduleKey === 'time_tracking');
  assert.deepEqual(parent, {
    moduleKey:'time_tracking', create:true, view:true, update:true, delete:true
  });
});
