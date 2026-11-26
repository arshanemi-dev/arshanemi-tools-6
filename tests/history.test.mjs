import test from 'node:test';
import assert from 'node:assert/strict';
import { historyTable, stepsOf, trendOf } from '../lib/research/history.js';

const REF = '2026-11-26';
const row = (t, id) => t.rows.find((r) => r.id === id);

test('day periods: the latest day + the days before it, oldest first', () => {
  const week = stepsOf('d7', REF);
  assert.equal(week.length, 7);
  assert.deepEqual(week.map((s) => s.id), ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']);
  assert.equal(week[6].sub, 'latest');
  assert.equal(week[0].label, '20 Nov');
  assert.equal(stepsOf('d3', REF).length, 3);
  assert.equal(stepsOf('d15', REF).length, 15);
});

test('1 Month: the last 30 days in weeks — Week 1 … Week 5 (the 5th = the last 2 days)', () => {
  const weeks = stepsOf('m1', REF);
  assert.deepEqual(weeks.map((s) => s.label), ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5']);
  assert.deepEqual([weeks[0].from, weeks[0].to], ['2026-10-28', '2026-11-03']);
  assert.deepEqual([weeks[4].from, weeks[4].to], ['2026-11-25', '2026-11-26']);
});

test('All Time: one column per month from the first snapshot, across a new year', () => {
  const months = stepsOf('all', '2027-01-10', '2026-11-05');
  assert.deepEqual(months.map((s) => s.label), ['Nov 2026', 'Dec 2026', 'Jan 2027']);
  assert.deepEqual([months[0].from, months[0].to], ['2026-11-01', '2026-11-30']);
  assert.equal(months[2].to, '2027-01-10'); // the running month ends today
});

// A product tracked 20–26 Nov (no snapshot on the 23rd): rank 30 → 24,
// reviews 100 → 160, price steady.
const h = {};
const ranks = { 20: 30, 21: 29, 22: 28, 24: 26, 25: 25, 26: 24 };
for (const [d, r] of Object.entries(ranks)) h[`2026-11-${d}`] = { r, p: 499, rv: 100 + (Number(d) - 20) * 10, rt: 4.1 };
h['2026-11-19'] = { r: 31, p: 499, rv: 95, rt: 4.0 };
const P = { key: 'amazon:X', h };

test('1 Week: one value per day, a missing day is "-", Average over every day', () => {
  const t = historyTable(P, 'd7', REF);
  assert.deepEqual(row(t, 'rank').values, [30, 29, 28, null, 26, 25, 24]);
  assert.equal(row(t, 'rank').average, 27); // (30+29+28+26+25+24) / 6
  assert.equal(row(t, 'rank').total, null);
  assert.deepEqual(row(t, 'days').values, [1, 1, 1, 0, 1, 1, 1]);
  assert.equal(row(t, 'days').total, 6);
  // Reviews gained: day 1 vs the 19th (95 → 100), then day by day.
  assert.deepEqual(row(t, 'gained').values, [5, 10, 10, null, 20, 10, 10]);
  assert.equal(row(t, 'gained').total, 65); // 95 → 160
  assert.deepEqual(row(t, 'reviews').values.at(-1), 160);
});

test('1 Month: week averages; weeks with no snapshot are "-"', () => {
  const t = historyTable(P, 'm1', REF);
  const rank = row(t, 'rank').values;
  assert.deepEqual(rank.slice(0, 3), [null, null, null]);
  assert.equal(rank[3], 28.8); // 18–24 Nov: 31, 30, 29, 28, 26 → 28.8
  assert.equal(rank[4], 24.5); // 25–26 Nov
});

test('All Time: monthly averages and totals', () => {
  const t = historyTable(P, 'all', REF);
  assert.deepEqual(t.steps.map((s) => s.label), ['Nov 2026']);
  assert.equal(row(t, 'days').total, 7);
  assert.equal(row(t, 'price').values[0], 499);
});

test('trend: best-fit line, angle and growth — rank going down the numbers is "up"', () => {
  const tr = trendOf([30, 29, 28, null, 26, 25, 24], { invert: true });
  assert.equal(tr.direction, 'up');
  assert.ok(tr.angle > 10 && tr.angle < 15); // ~6 places on an average of 27 → atan(0.22) ≈ 12.5°
  assert.equal(tr.growth, 6); // climbed 6 places
  assert.equal(tr.line.length, 7);
  assert.ok(Math.abs(tr.line[0] - 30) < 0.5 && Math.abs(tr.line[6] - 24) < 0.5);
  const reviews = trendOf([100, 110, 120], {});
  assert.equal(reviews.direction, 'up');
  assert.equal(reviews.growthPct, 20);
  assert.equal(trendOf([499, 499, 499]).direction, 'flat');
  assert.equal(trendOf([5, null]), null); // one value isn't a trend
});
