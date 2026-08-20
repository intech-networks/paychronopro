import test from 'node:test';
import assert from 'node:assert/strict';
import { removePreviouslySynced, uniqueAttendanceRecords } from '../src/sync/deduplicate.js';

test('removes records synchronized by any earlier device backup', () => {
  const oldUser = { userId: '7', name: 'Ana', role: 0 };
  const oldAttendance = { userId: '7', userSerialNumber: 2, timestamp: '2026-08-18T08:00:00.000Z' };
  const result = removePreviouslySynced({
    createdAt: '2026-08-18T09:00:00.000Z',
    device: {},
    users: [oldUser, oldUser, { userId: '8', name: 'Ben', role: 0 }],
    attendance: [
      { ...oldAttendance, userSerialNumber: '2', timestamp: '2026-08-18T16:00:00+08:00' },
      { userId: '8', userSerialNumber: 3, timestamp: '2026-08-18T08:05:00.000Z' }
    ]
  }, [
    { users: [], attendance: [oldAttendance] },
    { users: [oldUser], attendance: [] }
  ]);

  assert.deepEqual(result.users, [{ userId: '8', name: 'Ben', role: 0 }]);
  assert.deepEqual(result.attendance, [
    { userId: '8', userSerialNumber: 3, timestamp: '2026-08-18T08:05:00.000Z' }
  ]);
});

test('keeps a changed user record while removing exact duplicates in one upload', () => {
  const result = removePreviouslySynced({
    users: [
      { userId: '7', name: 'Ana Maria' },
      { name: 'Ana Maria', userId: '7' }
    ],
    attendance: []
  }, [{ users: [{ userId: '7', name: 'Ana' }], attendance: [] }]);

  assert.deepEqual(result.users, [{ userId: '7', name: 'Ana Maria' }]);
});

test('does not count repeated attendance punches as separate synchronized records', () => {
  const records = [
    { userId: '7', userSerialNumber: 1, timestamp: '2026-08-20T08:00:00.000Z' },
    { userId: '7', userSerialNumber: 2, timestamp: '2026-08-20T08:00:00.000Z' },
    { userId: '7', userSerialNumber: 3, timestamp: '2026-08-20T08:03:00.000Z' },
    { userId: '8', userSerialNumber: 4, timestamp: '2026-08-20T08:03:00.000Z' },
    { userId: '7', userSerialNumber: 5, timestamp: '2026-08-20T17:00:00.000Z' }
  ];

  assert.deepEqual(uniqueAttendanceRecords(records), [records[0], records[3], records[4]]);
});
