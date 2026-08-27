import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPayrollPreviewToken,
  verifyPayrollPreviewToken
} from '../src/payroll/preview-token.js';

const secret = 'test-secret-that-is-long-enough-for-hmac';
const preview = {
  employee:{ id:'12', name:'Employee One' },
  period:{ periodStart:'2026-08-01', periodEnd:'2026-08-15', payDate:'2026-08-15' },
  attendance:{ requiresReview:false },
  grossPay:5000,
  totalDeductions:700,
  netPay:4300
};

test('authenticates an unchanged server payroll preview regardless of key order', () => {
  const token = createPayrollPreviewToken(preview, secret, { now:1000 });
  const reordered = {
    netPay:4300,
    employee:{ name:'Employee One', id:'12' },
    attendance:{ requiresReview:false },
    grossPay:5000,
    period:{ payDate:'2026-08-15', periodEnd:'2026-08-15', periodStart:'2026-08-01' },
    totalDeductions:700,
    payrollRunToken:token
  };
  assert.equal(verifyPayrollPreviewToken(token, reordered, secret, { now:2000 }), true);
});

test('rejects changed, expired, and incorrectly signed payroll previews', () => {
  const token = createPayrollPreviewToken(preview, secret, {
    now:1000,
    lifetimeMilliseconds:1000
  });
  assert.equal(verifyPayrollPreviewToken(token, { ...preview, netPay:4300.01 }, secret, { now:1500 }), false);
  assert.equal(verifyPayrollPreviewToken(token, preview, secret, { now:2001 }), false);
  assert.equal(verifyPayrollPreviewToken(token, preview, `${secret}-wrong`, { now:1500 }), false);
});
