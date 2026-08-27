import assert from 'node:assert/strict';
import test from 'node:test';
import { createPayrollPreviewToken } from '../src/payroll/preview-token.js';
import { validatePayrollRunPreviews } from '../src/payroll/run-preview-validation.js';

const secret = 'test-secret-that-is-long-enough-for-hmac';

function signedItem(requiresReview = false) {
  const calculation = {
    employeeId:'12',
    attendance:{ requiresReview },
    grossPay:5000,
    netPay:4300
  };
  calculation.payrollRunToken = createPayrollPreviewToken(calculation, secret, { now:1000 });
  return { calculation };
}

test('accepts an authentic payroll preview with resolved attendance', () => {
  assert.deepEqual(validatePayrollRunPreviews([signedItem()], secret, { now:1500 }), {
    status:200
  });
});

test('rejects unsigned, changed, and unresolved payroll previews', () => {
  assert.equal(validatePayrollRunPreviews([
    { calculation:{ attendance:{ requiresReview:false } } }
  ], secret, { now:1500 }).status, 400);

  const changed = signedItem();
  changed.calculation.netPay = 4300.01;
  assert.equal(validatePayrollRunPreviews([changed], secret, { now:1500 }).status, 400);

  const unresolved = validatePayrollRunPreviews([signedItem(true)], secret, { now:1500 });
  assert.equal(unresolved.status, 409);
  assert.match(unresolved.error, /unapproved attendance/i);
});
