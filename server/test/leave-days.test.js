import test from 'node:test';
import assert from 'node:assert/strict';
import { countLeaveWorkDays } from '../src/time/leave-days.js';

test('excludes weekend rest days from a standard leave range', () => {
  assert.equal(countLeaveWorkDays('2026-08-17', '2026-08-23'), 5);
});

test('uses the employee assigned working days', () => {
  assert.equal(countLeaveWorkDays('2026-08-17', '2026-08-23', ['tuesday','thursday','saturday']), 3);
});

test('returns zero when a leave range contains only rest days', () => {
  assert.equal(countLeaveWorkDays('2026-08-22', '2026-08-23'), 0);
});
