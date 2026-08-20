import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseNearbyTimeEntries } from '../src/time/filterEntries.js';

test('keeps only the first time entry within each five-minute range', () => {
  const entries = [
    { timestamp: '2026-03-03T03:19:17.000Z' },
    { timestamp: '2026-03-03T03:19:18.000Z' },
    { timestamp: '2026-03-03T03:23:30.000Z' },
    { timestamp: '2026-03-03T03:24:17.000Z' },
    { timestamp: '2026-03-03T03:24:18.000Z' },
    { timestamp: '2026-03-03T03:29:18.000Z' }
  ];

  assert.deepEqual(collapseNearbyTimeEntries(entries), [entries[0], entries[4]]);
});
