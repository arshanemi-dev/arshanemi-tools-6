import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyRows, kpis, mergeProducts, productSummary, referenceDay, seriesFor, snapAt } from '../lib/research/metrics.js';

// The user's reference sheet: link A climbs DOWN the listing 20 → 29 over
// 1–10 Nov 2026, link B climbs UP 29 → 21.
const day = (d) => `2026-11-${String(d).padStart(2, '0')}`;
function product(key, ranks) {
  const h = {};
  ranks.forEach((r, i) => { h[day(i + 1)] = { r, p: 499, m: 999, rt: 4.1, rv: 100 + i * 5 }; });
  return { key, id: key, platform: 'meesho', link: `https://www.meesho.com/x/p/${key}`, title: key, firstSeen: day(1), lastSeen: day(ranks.length), h };
}
const A = product('A', [20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
const B = product('B', [29, 28, 27, 26, 25, 24, 23, 22, 21, 21]);
const tracks = [{ id: 't1', query: 'kurti', products: { A, B } }];

test('reference day is the latest snapshot (within the date filter)', () => {
  const products = mergeProducts(tracks);
  assert.equal(referenceDay(products), day(10));
  assert.equal(referenceDay(products, day(5)), day(5));
});

test('snapAt takes the latest snapshot on or before the day asked', () => {
  assert.equal(snapAt(A.h, day(3)).r, 22);
  assert.equal(snapAt(A.h, '2026-10-31'), null); // nothing that far back — no guess
});

test('rank moves: positive = climbed, negative = fell; too-far-back is null', () => {
  const a = productSummary(A, day(10));
  const b = productSummary(B, day(10));
  assert.equal(a.rank, 29);
  assert.equal(a.moves.d7, 22 - 29); // 7 days before 10 Nov = 3 Nov, rank 22
  assert.equal(b.moves.d7, 27 - 21);
  assert.equal(a.moves.d15, null);
  assert.equal(a.all, 20 - 29);
  assert.equal(b.all, 29 - 21);
  assert.equal(a.status, 'Falling');
  assert.equal(b.status, 'Rising');
  assert.equal(b.bestRank, 21);
  assert.equal(a.reviewsGain.d7, 145 - 110);
  assert.equal(a.discount, 50);
});

test('a product missing on the reference day is Dropped and has no rank', () => {
  const C = product('C', [5, 6, 7]);
  const s = productSummary(C, day(10));
  assert.equal(s.rank, null);
  assert.equal(s.status, 'Dropped');
  assert.equal(s.moves.d7, null);
});

test('daily rows follow the sheet layout with moves vs that day', () => {
  const rows = dailyRows([A]);
  assert.equal(rows.length, 10);
  const nov10 = rows.find((r) => r.date === day(10));
  assert.equal(nov10.rank, 29);
  assert.equal(nov10.moves.d7, -7);
  assert.equal(rows.find((r) => r.date === day(1)).all, null);
  assert.equal(dailyRows([A], day(9)).length, 2);
});

test('chart series cover the window and leave gaps, not zeros', () => {
  const gap = product('G', [10, 11, 12]);
  delete gap.h[day(2)];
  const [s] = seriesFor([gap], 'rank', day(3), 7);
  assert.deepEqual(s.points.map((p) => p.t), [day(1), day(3)]);
  const [last2] = seriesFor([A], 'rank', day(10), 2);
  assert.deepEqual(last2.points.map((p) => p.value), [28, 29]);
});

test('kpis count risers / fallers over the rows shown', () => {
  const rows = [productSummary(A, day(10)), productSummary(B, day(10))];
  const k = kpis(rows);
  assert.equal(k.products, 2);
  assert.equal(k.rising, 1);
  assert.equal(k.falling, 1);
  assert.equal(k.avgPrice, 499);
});

test('bought is carried into the summary, daily rows, chart and cards', async () => {
  const { chartDays } = await import('../lib/research/metrics.js');
  const P = product('P', [5, 4, 3]);
  P.h[day(2)].b = 300;
  P.h[day(3)].b = 1000;
  const s = productSummary(P, day(3));
  assert.equal(s.bought, 1000);
  assert.equal(dailyRows([P]).find((r) => r.date === day(2)).bought, 300);
  const [series] = seriesFor([P], 'bought', day(3), 7);
  assert.deepEqual(series.points.map((p) => p.value), [300, 1000]); // day 1 had none — a gap, not 0
  assert.equal(kpis([s, productSummary(A, day(10))]).bought, 1000);
  // The x axis starts at the first day with data, not 3 months back.
  assert.deepEqual(chartDays([series], day(3), 90), [day(2), day(3)]);
  assert.deepEqual(chartDays([], day(3), 90), []);
});
