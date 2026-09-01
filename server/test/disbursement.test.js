import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransitionDisbursement, validateDisbursementUpdate } from '../src/payroll/disbursement.js';

test('requires payment details before marking a disbursement paid', () => {
  assert.match(validateDisbursementUpdate({ status:'paid' }).error, /method/i);
  assert.match(validateDisbursementUpdate({ status:'paid', method:'cash' }).error, /reference/i);
  assert.deepEqual(validateDisbursementUpdate({
    status:'paid', method:'bank_transfer', reference:'BANK-2026-001', notes:'Released'
  }).value, {
    status:'paid', method:'bank_transfer', reference:'BANK-2026-001', notes:'Released'
  });
});

test('keeps paid disbursements immutable', () => {
  assert.equal(canTransitionDisbursement('paid', 'pending'), false);
  assert.match(validateDisbursementUpdate({ status:'failed' }, 'paid').error, /cannot be reopened/i);
  assert.equal(validateDisbursementUpdate({
    status:'paid', method:'cash', reference:'OR-100'
  }, 'paid').value.status, 'paid');
});

test('accepts pending, processing, and failed operational states', () => {
  assert.equal(validateDisbursementUpdate({ status:'pending' }).value.status, 'pending');
  assert.equal(validateDisbursementUpdate({ status:'processing', method:'e_wallet' }).value.method, 'e_wallet');
  assert.equal(validateDisbursementUpdate({ status:'failed', notes:'Rejected by bank' }).value.status, 'failed');
});
