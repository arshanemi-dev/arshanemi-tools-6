import test from 'node:test';
import assert from 'node:assert/strict';
import { countPage, rankPages } from '../lib/scraper/rank.js';
import { everyDaysOf, isDue, readEveryDays, readMaxPerPage } from '../data/entrySettings.js';
import { daysBetweenISO } from '../lib/research/time.js';

const page = (n, ids, ads = []) => ({ page: n, products: ids.map((id) => ({ id, title: id, link: `https://x/${id}`, sponsored: ads.includes(id) })) });

test('Products / Page: only the first N of every page are kept, ranks stay the real place', () => {
  // 4 organic a page, keep 2: page 1 keeps a, b (ranks 1, 2); page 2 keeps e, f (ranks 5, 6).
  const out = rankPages([page(1, ['a', 'b', 'c', 'd']), page(2, ['e', 'f', 'g', 'h'])], 'flipkart', 1, 2);
  assert.deepEqual(Object.fromEntries(out.products.map((p) => [p.id, p.rank])), { a: 1, b: 2, e: 5, f: 6 });
  assert.equal(out.perPage, 4); // the real page size, for ranks after page 1
});

test('Products / Page: ads before the Nth are kept and not counted; repeats are skipped', () => {
  const out = rankPages([page(1, ['ad1', 'a', 'b', 'c'], ['ad1']), page(2, ['b', 'd', 'e'])], 'amazon', 1, 2);
  assert.deepEqual(out.products.map((p) => p.id), ['ad1', 'a', 'b', 'd', 'e']);
  assert.equal(out.products.find((p) => p.id === 'ad1').rank, null);
  assert.equal(out.products.find((p) => p.id === 'd').rank, 4); // c (not kept) was rank 3
});

test('Products / Page: a product past the limit on page 1 is not taken again on page 2', () => {
  const out = rankPages([page(1, ['a', 'b', 'c']), page(2, ['c', 'd'])], 'myntra', 1, 1);
  assert.deepEqual(out.products.map((p) => [p.id, p.rank]), [['a', 1], ['d', 4]]);
});

test('no limit = every product, as before', () => {
  const out = rankPages([page(1, ['a', 'b', 'c'])], 'meesho', 1, null);
  assert.equal(out.products.length, 3);
});

test('countPage counts what is kept, and what was new at all', () => {
  const seen = new Set(['x']);
  const c = countPage([{ id: 'x' }, { id: 'a' }, { id: 'ad', sponsored: true }, { id: 'b' }, { id: 'c' }], seen, 2);
  assert.deepEqual(c, { shown: 5, added: 3, ads: 1, fresh: 4 }); // a, ad, b kept; c new but past the limit
  assert.ok(seen.has('c'));
});

test('Read every N days: what can be typed', () => {
  assert.deepEqual(readEveryDays('3'), { value: 3 });
  assert.deepEqual(readEveryDays(''), { value: 0 });
  assert.deepEqual(readEveryDays(0), { value: 0 });
  assert.ok(readEveryDays('1.5').error);
  assert.ok(readEveryDays('-1').error);
  assert.ok(readEveryDays('366').error);
  assert.ok(readEveryDays('abc').error);
});

test('Products / Page: what can be typed', () => {
  assert.deepEqual(readMaxPerPage('20'), { value: 20 });
  assert.deepEqual(readMaxPerPage(''), { value: null });
  assert.deepEqual(readMaxPerPage('0'), { value: null });
  assert.ok(readMaxPerPage('2.5').error);
  assert.ok(readMaxPerPage('501').error);
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
