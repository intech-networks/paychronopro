import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateHolidayPayAdjustment } from '../src/payroll/holiday-pay.js';

const calculate = (holidayType, overrides = {}) => calculateHolidayPayAdjustment({
  dayRate:1000,
  workedMinutes:0,
  standardMinutes:480,
  isScheduledDay:true,
  holidayType,
  ...overrides
});

test('keeps regular and company scheduled holidays paid when no work is recorded', () => {
  assert.deepEqual(calculate('regular'), {
    baseDeduction:0,
    additionalPay:0,
    labels:['Regular holiday paid scheduled day'],
    breakdown:{ firstHoursAdditionalPay:0, overtimeAdditionalPay:0, regularMinutes:0, overtimeMinutes:0 }
  });
  assert.deepEqual(calculate('company'), {
    baseDeduction:0,
    additionalPay:0,
    labels:['Company holiday paid scheduled day'],
    breakdown:{ firstHoursAdditionalPay:0, overtimeAdditionalPay:0, regularMinutes:0, overtimeMinutes:0 }
  });
});

test('deducts the scheduled base for an unworked special non-working holiday', () => {
  const result = calculate('special_non_working');
  assert.equal(result.baseDeduction, 1000);
  assert.equal(result.additionalPay, 0);
  assert.deepEqual(result.labels, ['Special non-working holiday — no work, no pay']);
});

test('calculates first-eight-hour scheduled and rest-day holiday pay', () => {
  assert.equal(calculate('regular', { workedMinutes:480 }).additionalPay, 1000);
  assert.equal(calculate('regular', { workedMinutes:480, isScheduledDay:false }).additionalPay, 2600);
  const scheduledSpecial = calculate('special_non_working', { workedMinutes:480 });
  assert.equal(scheduledSpecial.baseDeduction, 1000);
  assert.equal(scheduledSpecial.additionalPay, 1300);
  assert.equal(calculate('special_non_working', { workedMinutes:480, isScheduledDay:false }).additionalPay, 1500);
});

test('pays only actual hours on a partially worked special non-working day', () => {
  const result = calculate('special_non_working', { workedMinutes:240 });
  assert.equal(result.baseDeduction, 1000);
  assert.equal(result.additionalPay, 650);
});

test('applies the official overtime multipliers after standard minutes', () => {
  const regularScheduled = calculate('regular', { workedMinutes:540 });
  assert.equal(regularScheduled.breakdown.overtimeAdditionalPay, 325);
  assert.equal(regularScheduled.additionalPay, 1325);

  const regularRest = calculate('regular', { workedMinutes:540, isScheduledDay:false });
  assert.equal(regularRest.breakdown.overtimeAdditionalPay, 422.5);
  assert.equal(regularRest.additionalPay, 3022.5);

  const specialScheduled = calculate('special_non_working', { workedMinutes:540 });
  assert.equal(specialScheduled.breakdown.overtimeAdditionalPay, 211.25);
  assert.equal(specialScheduled.additionalPay, 1511.25);

  const specialRest = calculate('special_non_working', { workedMinutes:540, isScheduledDay:false });
  assert.equal(specialRest.breakdown.overtimeAdditionalPay, 243.75);
  assert.equal(specialRest.additionalPay, 1743.75);
});

test('company and other holidays add no statutory worked-day or overtime premium', () => {
  for (const holidayType of ['company', 'other']) {
    const result = calculate(holidayType, { workedMinutes:600, isScheduledDay:false });
    assert.equal(result.baseDeduction, 0);
    assert.equal(result.additionalPay, 0);
    assert.match(result.labels[0], /no statutory premium/);
  }
});

test('rounds every monetary result to cents and rejects unsafe inputs', () => {
  const result = calculate('regular', { dayRate:999.99, workedMinutes:517 });
  assert.equal(result.breakdown.firstHoursAdditionalPay, 999.99);
  assert.equal(result.breakdown.overtimeAdditionalPay, 200.41);
  assert.equal(result.additionalPay, 1200.4);

  assert.throws(() => calculate('regular', { standardMinutes:0 }), /greater than zero/);
  assert.throws(() => calculate('regular', { dayRate:-1 }), /non-negative/);
  assert.throws(() => calculate('unknown'), /holidayType/);
});
