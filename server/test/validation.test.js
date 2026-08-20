import test from 'node:test';
import assert from 'node:assert/strict';
import { isEmail, isIsoDate, isLeaveBalance, isPositiveInteger } from '../src/validation.js';

test('positive integer validation rejects malformed identifiers', () => {
  assert.equal(isPositiveInteger('42'), true);
  assert.equal(isPositiveInteger('0'), false);
  assert.equal(isPositiveInteger('-1'), false);
  assert.equal(isPositiveInteger('1 OR 1=1'), false);
});

test('email validation accepts normal addresses and rejects malformed input', () => {
  assert.equal(isEmail('employee@example.com'), true);
  assert.equal(isEmail('not-an-email'), false);
  assert.equal(isEmail(`a@${'x'.repeat(250)}.com`), false);
});

test('ISO date validation rejects impossible and loosely formatted dates', () => {
  assert.equal(isIsoDate('2026-08-17'), true);
  assert.equal(isIsoDate(''), true);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('08/17/2026'), false);
});

test('leave balance validation accepts bounded day credits', () => {
  assert.equal(isLeaveBalance(10), true);
  assert.equal(isLeaveBalance('7.5'), true);
  assert.equal(isLeaveBalance(''), false);
  assert.equal(isLeaveBalance(-1), false);
  assert.equal(isLeaveBalance(1000), false);
  assert.equal(isLeaveBalance('not-a-number'), false);
});
