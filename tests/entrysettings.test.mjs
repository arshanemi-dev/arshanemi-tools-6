import test from 'node:test';
import assert from 'node:assert/strict';
import { everyDaysOf, isDue, readEveryDays, readTarget, targetOf } from '../data/entrySettings.js';
import { daysBetweenISO } from '../lib/research/time.js';

test('Read every N days: what can be typed', () => {
  assert.deepEqual(readEveryDays('3'), { value: 3 });
  assert.deepEqual(readEveryDays(''), { value: 0 });
  assert.deepEqual(readEveryDays(0), { value: 0 });
  assert.ok(readEveryDays('1.5').error);
  assert.ok(readEveryDays('-1').error);
  assert.ok(readEveryDays('366').error);
  assert.ok(readEveryDays('abc').error);
});

test('Products to Read: what can be typed, and the default', () => {
  assert.deepEqual(readTarget('250'), { value: 250 });
  assert.deepEqual(readTarget(40), { value: 40 });
  assert.ok(readTarget('').error); // a number is needed
  assert.ok(readTarget('0').error);
  assert.ok(readTarget('2.5').error);
  assert.ok(readTarget('1001').error);
  assert.equal(targetOf({ targetProducts: 60 }), 60);
  assert.equal(targetOf({}), 100); // older entries
});

test('older entries: autoDaily on = every day, off = 0', () => {
  assert.equal(everyDaysOf({ autoDaily: true }), 1);
  assert.equal(everyDaysOf({ autoDaily: false }), 0);
  assert.equal(everyDaysOf({}), 1);
  assert.equal(everyDaysOf({ everyDays: 4, autoDaily: true }), 4);
});

test('isDue: read again once N days have passed since the last read', () => {
  const e = { everyDays: 3 };
  assert.equal(isDue(e, null, '2026-11-26', daysBetweenISO), true); // never read
  assert.equal(isDue(e, '2026-11-24', '2026-11-26', daysBetweenISO), false); // 2 days ago
  assert.equal(isDue(e, '2026-11-23', '2026-11-26', daysBetweenISO), true); // 3 days ago
  assert.equal(isDue({ everyDays: 1 }, '2026-11-26', '2026-11-26', daysBetweenISO), false); // read today
  assert.equal(isDue({ everyDays: 0 }, null, '2026-11-26', daysBetweenISO), false); // off
  assert.equal(isDue({ everyDays: 2, kind: 'import' }, null, '2026-11-26', daysBetweenISO), false);
});
