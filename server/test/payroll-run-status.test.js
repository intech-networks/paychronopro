import assert from 'node:assert/strict';
import test from 'node:test';
import { canTransitionPayrollRun } from '../src/payroll/run-status.js';

test('allows payroll run finalization and voiding without reopening completed runs', () => {
  assert.equal(canTransitionPayrollRun('draft', 'finalized'), true);
  assert.equal(canTransitionPayrollRun('draft', 'void'), true);
  assert.equal(canTransitionPayrollRun('finalized', 'void'), true);
  assert.equal(canTransitionPayrollRun('finalized', 'draft'), false);
  assert.equal(canTransitionPayrollRun('void', 'draft'), false);
  assert.equal(canTransitionPayrollRun('void', 'finalized'), false);
});

test('treats an unchanged valid status as idempotent', () => {
  assert.equal(canTransitionPayrollRun('draft', 'draft'), true);
  assert.equal(canTransitionPayrollRun('finalized', 'finalized'), true);
  assert.equal(canTransitionPayrollRun('void', 'void'), true);
});
