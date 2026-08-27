import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOrdinaryWorkAdjustment,
  isFuturePayoutPeriodEnd,
  isStatutoryPremiumTaxable,
  manilaDateValue
} from '../src/payroll/payout-adjustments.js';

const calculate = (overrides = {}) => calculateOrdinaryWorkAdjustment({
  dayRate:1000,
  workedMinutes:0,
  standardMinutes:480,
  isScheduledDay:true,
  approvedMinutes:0,
  ...overrides
});

test('uses the Manila calendar date at UTC day boundaries', () => {
  const beforeMidnight = new Date('2026-08-26T15:59:59Z');
  const atMidnight = new Date('2026-08-26T16:00:00Z');
  assert.equal(manilaDateValue(beforeMidnight), '2026-08-26');
  assert.equal(manilaDateValue(atMidnight), '2026-08-27');
  assert.equal(isFuturePayoutPeriodEnd('2026-08-27', beforeMidnight), true);
  assert.equal(isFuturePayoutPeriodEnd('2026-08-27', atMidnight), false);
  assert.throws(() => manilaDateValue('not-a-date'), /valid date/);
});

test('keeps statutory premiums non-taxable only for qualified minimum-wage earners', () => {
  assert.equal(isStatutoryPremiumTaxable(true), false);
  assert.equal(isStatutoryPremiumTaxable(false), true);
  assert.equal(isStatutoryPremiumTaxable(undefined), true);
});

test('does not silently pay unapproved ordinary overtime', () => {
  const result = calculate({ workedMinutes:600 });
  assert.equal(result.additionalPay, 0);
  assert.equal(result.approvalRequired, true);
  assert.deepEqual(result.breakdown, {
    candidateMinutes:120,
    approvedMinutes:0,
    unapprovedMinutes:120,
    firstHoursMinutes:0,
    overtimeMinutes:0,
    firstHoursPay:0,
    overtimePay:0
  });
});

test('pays approved ordinary-day overtime at 125 percent', () => {
  const result = calculate({ workedMinutes:600, approvedMinutes:120 });
  assert.equal(result.additionalPay, 312.5);
  assert.equal(result.approvalRequired, false);
  assert.equal(result.breakdown.overtimePay, 312.5);
});

test('pays approved rest-day work at 130 percent and overtime at 169 percent', () => {
  const firstEightHours = calculate({
    workedMinutes:480,
    approvedMinutes:480,
    isScheduledDay:false
  });
  assert.equal(firstEightHours.additionalPay, 1300);
  assert.equal(firstEightHours.breakdown.firstHoursPay, 1300);

  const withOvertime = calculate({
    workedMinutes:540,
    approvedMinutes:540,
    isScheduledDay:false
  });
  assert.equal(withOvertime.breakdown.overtimePay, 211.25);
  assert.equal(withOvertime.additionalPay, 1511.25);
});

test('caps payment at approved and actually worked minutes', () => {
  const partiallyApproved = calculate({
    workedMinutes:600,
    approvedMinutes:60
  });
  assert.equal(partiallyApproved.additionalPay, 156.25);
  assert.equal(partiallyApproved.approvalRequired, true);
  assert.equal(partiallyApproved.breakdown.unapprovedMinutes, 60);

  const approvalBeyondWork = calculate({
    workedMinutes:540,
    approvedMinutes:300
  });
  assert.equal(approvalBeyondWork.additionalPay, 156.25);
  assert.equal(approvalBeyondWork.breakdown.approvedMinutes, 60);
});

test('rejects unsafe ordinary-work inputs', () => {
  assert.throws(() => calculate({ dayRate:-1 }), /non-negative/);
  assert.throws(() => calculate({ standardMinutes:0 }), /greater than zero/);
  assert.throws(() => calculate({ isScheduledDay:'yes' }), /boolean/);
});
