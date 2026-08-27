import test from 'node:test';
import assert from 'node:assert/strict';
import { isPayrollPeriodShapeValid } from '../src/payroll/period-validation.js';

const period = (frequency, periodStart, periodEnd) => ({ frequency, periodStart, periodEnd });

test('weekly payroll periods contain exactly seven inclusive calendar days', () => {
  assert.equal(isPayrollPeriodShapeValid(period('weekly', '2026-08-01', '2026-08-07')), true);
  assert.equal(isPayrollPeriodShapeValid(period('weekly', '2026-08-29', '2026-09-04')), true);
  assert.equal(isPayrollPeriodShapeValid(period('weekly', '2026-08-01', '2026-08-06')), false);
  assert.equal(isPayrollPeriodShapeValid(period('weekly', '2026-08-01', '2026-08-08')), false);
});

test('biweekly payroll periods contain exactly fourteen inclusive calendar days', () => {
  assert.equal(isPayrollPeriodShapeValid(period('biweekly', '2026-08-01', '2026-08-14')), true);
  assert.equal(isPayrollPeriodShapeValid(period('biweekly', '2026-12-25', '2027-01-07')), true);
  assert.equal(isPayrollPeriodShapeValid(period('biweekly', '2026-08-01', '2026-08-13')), false);
  assert.equal(isPayrollPeriodShapeValid(period('biweekly', '2026-08-01', '2026-08-15')), false);
});

test('semi-monthly periods match the first or second calendar-month cutoff', () => {
  assert.equal(isPayrollPeriodShapeValid(period('semi_monthly', '2026-08-01', '2026-08-15')), true);
  assert.equal(isPayrollPeriodShapeValid(period('semi_monthly', '2026-08-16', '2026-08-31')), true);
  assert.equal(isPayrollPeriodShapeValid(period('semi_monthly', '2028-02-16', '2028-02-29')), true);
  assert.equal(isPayrollPeriodShapeValid(period('semi_monthly', '2026-02-16', '2026-02-28')), true);
  assert.equal(isPayrollPeriodShapeValid(period('semi_monthly', '2026-08-01', '2026-08-14')), false);
  assert.equal(isPayrollPeriodShapeValid(period('semi_monthly', '2026-08-15', '2026-08-31')), false);
});

test('monthly periods cover one complete calendar month', () => {
  assert.equal(isPayrollPeriodShapeValid(period('monthly', '2026-08-01', '2026-08-31')), true);
  assert.equal(isPayrollPeriodShapeValid(period('monthly', '2028-02-01', '2028-02-29')), true);
  assert.equal(isPayrollPeriodShapeValid(period('monthly', '2026-02-01', '2026-02-28')), true);
  assert.equal(isPayrollPeriodShapeValid(period('monthly', '2026-08-02', '2026-08-31')), false);
  assert.equal(isPayrollPeriodShapeValid(period('monthly', '2026-08-01', '2026-09-01')), false);
});

test('invalid dates, reversed ranges, and unsupported frequencies are rejected', () => {
  assert.equal(isPayrollPeriodShapeValid(period('weekly', 'invalid', '2026-08-07')), false);
  assert.equal(isPayrollPeriodShapeValid(period('weekly', '2026-08-07', '2026-08-01')), false);
  assert.equal(isPayrollPeriodShapeValid(period('daily', '2026-08-01', '2026-08-01')), false);
  assert.equal(isPayrollPeriodShapeValid(), false);
});
