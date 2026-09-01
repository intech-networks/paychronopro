import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePayrollRunInput } from '../src/payroll/run-validation.js';

const validItem = {
  employeeId:'12',
  grossCompensation:5000,
  taxableIncome:4300,
  nonTaxableCompensation:100,
  contributions:{ sssEmployee:250, philhealthEmployee:125, pagibigEmployee:100 },
  unionDues:25,
  tax:200,
  netPay:4300
};

test('accepts a complete payroll run payload', () => {
  const result = validatePayrollRunInput({
    periodStart:'2026-08-01',
    periodEnd:'2026-08-15',
    payDate:'2026-08-15',
    items:[validItem]
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.items[0].employeeId, '12');
});

test('accepts valid decimal-cent values affected by floating-point representation', () => {
  const result = validatePayrollRunInput({
    periodStart:'2026-08-01',
    periodEnd:'2026-08-15',
    payDate:'2026-08-15',
    items:[{
      ...validItem,
      grossCompensation:0.29,
      taxableIncome:0.29,
      nonTaxableCompensation:0,
      contributions:{ sssEmployee:0, philhealthEmployee:0, pagibigEmployee:0 },
      unionDues:0,
      tax:0,
      netPay:0.29
    }]
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.items[0].grossCompensation, 0.29);
});

test('accepts a payout preview with attendance and recurring deductions', () => {
  const result = validatePayrollRunInput({
    periodStart:'2026-08-01',
    periodEnd:'2026-08-15',
    payDate:'2026-08-15',
    items:[{
      employeeId:'12',
      grossPay:10000,
      earnings:[{ name:'Meal allowance', value:100, isTaxable:false }],
      salary:{ attendanceDeduction:500 },
      deductions:[{ name:'Loan', value:200 }],
      contributions:{ sssEmployee:150, philhealthEmployee:100, pagibigEmployee:50 },
      unionDues:25,
      tax:{ amount:125, taxableIncome:9000 },
      totalDeductions:1150,
      netPay:8850
    }]
  });

  assert.equal(result.error, undefined);
  assert.equal(result.value.items[0].grossCompensation, 10000);
  assert.equal(result.value.items[0].tax, 125);
  assert.equal(result.value.items[0].nonTaxableCompensation, 100);
});

test('accepts a signed-style year-end tax refund that increases take-home pay', () => {
  const result = validatePayrollRunInput({
    periodStart:'2026-12-16',
    periodEnd:'2026-12-31',
    payDate:'2026-12-31',
    items:[{
      employeeId:'12',
      grossPay:1000,
      taxableIncome:1000,
      contributions:{ sssEmployee:0, philhealthEmployee:0, pagibigEmployee:0 },
      unionDues:0,
      tax:{ amount:0, refund:100 },
      totalDeductions:-100,
      netPay:1100
    }]
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.items[0].taxRefund, 100);
});

test('rejects malformed dates, duplicate employees, and invalid money', () => {
  assert.match(validatePayrollRunInput({
    periodStart:'',
    periodEnd:'',
    payDate:'',
    items:[validItem]
  }).error, /valid payroll period/i);

  assert.match(validatePayrollRunInput({
    periodStart:'invalid',
    periodEnd:'2026-08-15',
    payDate:'2026-08-15',
    items:[validItem]
  }).error, /valid payroll period/i);

  assert.match(validatePayrollRunInput({
    periodStart:'2026-08-01',
    periodEnd:'2026-08-15',
    payDate:'2026-08-15',
    items:[validItem, validItem]
  }).error, /only once/i);

  assert.match(validatePayrollRunInput({
    periodStart:'2026-08-01',
    periodEnd:'2026-08-15',
    payDate:'2026-08-15',
    items:[{ ...validItem, employeeId:'999999999999999999999' }]
  }).error, /valid and included only once/i);

  assert.match(validatePayrollRunInput({
    periodStart:'2026-08-01',
    periodEnd:'2026-08-15',
    payDate:'2026-08-15',
    items:[{ ...validItem, tax:-1 }]
  }).error, /non-negative monetary/i);

  assert.match(validatePayrollRunInput({
    periodStart:'2026-08-01',
    periodEnd:'2026-08-15',
    payDate:'2026-08-15',
    items:[{ ...validItem, netPay:4900 }]
  }).error, /invalid net pay/i);

  assert.match(validatePayrollRunInput({
    periodStart:'2026-08-01',
    periodEnd:'2026-08-15',
    payDate:'2026-08-15',
    items:[{ ...validItem, taxableIncome:4900, nonTaxableCompensation:200 }]
  }).error, /cannot exceed gross compensation/i);

  assert.match(validatePayrollRunInput({
    periodStart:'2026-08-01',
    periodEnd:'2026-08-15',
    payDate:'2026-08-15',
    items:[{ ...validItem, taxableIncome:4900.01, nonTaxableCompensation:100 }]
  }).error, /cannot exceed gross compensation/i);

  assert.match(validatePayrollRunInput({
    periodStart:'2026-08-01',
    periodEnd:'2026-08-15',
    payDate:'2026-08-15',
    items:[{ ...validItem, totalDeductions:999 }]
  }).error, /inconsistent total deductions/i);

  assert.match(validatePayrollRunInput({
    periodStart:'2026-08-01',
    periodEnd:'2026-08-15',
    payDate:'2026-08-15',
    items:[{ ...validItem, totalDeductions:700.01 }]
  }).error, /inconsistent total deductions/i);

  assert.match(validatePayrollRunInput({
    periodStart:'2026-08-01',
    periodEnd:'2026-08-15',
    payDate:'2026-08-15',
    items:[{ ...validItem, netPay:4300.01 }]
  }).error, /invalid net pay/i);
});

test('rejects an early pay date and periods longer than one month', () => {
  assert.match(validatePayrollRunInput({
    periodStart:'2026-08-01',
    periodEnd:'2026-08-15',
    payDate:'2026-08-14',
    items:[validItem]
  }).error, /cannot be earlier/i);

  assert.match(validatePayrollRunInput({
    periodStart:'2026-01-01',
    periodEnd:'2026-12-31',
    payDate:'2026-12-31',
    items:[validItem]
  }).error, /31 calendar days/i);

  assert.match(validatePayrollRunInput({
    periodStart:'2026-08-01',
    periodEnd:'2026-08-15',
    payDate:'2026-10-01',
    items:[validItem]
  }).error, /31 days after/i);
});
