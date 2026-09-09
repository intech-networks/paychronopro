import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAssignWorkforceRole,
  hasPermission,
  normalizePermissionHierarchy,
  parentModuleByChild
} from '../src/auth/authorization.js';

function userWith(...permissions) {
  return { permissions: permissions.map(([moduleKey, operations]) => ({ moduleKey, ...operations })) };
}

test('defines every parent and child module relationship', () => {
  assert.deepEqual(parentModuleByChild, {
    company: 'setup',
    site_settings: 'setup',
    organization: 'setup',
    shift_management: 'setup',
    tax_configuration: 'payroll',
    workforce: 'workforce_module',
    leave_management: 'setup',
    roles: 'setup',
    time_entries: 'time_tracking',
    exemption_report: 'time_tracking',
    requests: 'time_tracking',
    leave_application: 'time_tracking',
    overtime_request: 'time_tracking',
    shift_change: 'time_tracking',
    scheduler: 'utilities',
    device_users: 'utilities',
    payroll_setup: 'payroll',
    payout_view: 'payroll',
    disbursement: 'payroll'
  });
});

test('child access requires the same operation on its parent', () => {
  const childOnly = userWith(['shift_management', { view:true, update:true }]);
  assert.equal(hasPermission(childOnly, 'shift_management', 'view'), false);
  assert.equal(hasPermission(childOnly, 'shift_management', 'update'), false);

  const parentAndChild = userWith(
    ['setup', { view:true, update:false }],
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

test('preserves the normal Employee role workflow without role-management access', () => {
  const workforceEditor = userWith(
    ['workforce_module', { update:true }],
    ['workforce', { update:true }]
  );

  assert.equal(canAssignWorkforceRole(workforceEditor, { id:'2', name:'Employee' }), true);
  assert.equal(canAssignWorkforceRole(workforceEditor, { id:'3', name:'HR Manager' }), false);
  assert.equal(canAssignWorkforceRole(workforceEditor, { id:'3', name:'HR Manager' }, '3'), true);
});

test('requires role-management access before assigning a non-default workforce role', () => {
  const roleManager = userWith(
    ['setup', { update:true }],
    ['roles', { update:true }]
  );

  assert.equal(canAssignWorkforceRole(roleManager, { id:'3', name:'HR Manager' }), true);
  assert.equal(canAssignWorkforceRole(roleManager, { id:'1', name:'Administrator' }), false);
});
