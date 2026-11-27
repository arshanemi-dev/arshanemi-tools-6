import test from 'node:test';
import assert from 'node:assert/strict';
import { countPage, rankPages } from '../lib/scraper/rank.js';
import { pageRange } from '../data/marketplaces.js';

const page = (n, ids, ads = []) => ({ page: n, products: ids.map((id) => ({ id, title: id, link: `https://x/${id}`, sponsored: ads.includes(id) })) });

test('pages 1–2: ranks count from 1, ads get no rank, repeats are kept once', () => {
  const out = rankPages([page(1, ['a', 'ad1', 'b', 'c'], ['ad1']), page(2, ['c', 'd', 'e'])], 'flipkart', 1);
  const rank = Object.fromEntries(out.products.map((p) => [p.id, p.rank]));
  assert.deepEqual(rank, { a: 1, ad1: null, b: 2, c: 3, d: 4, e: 5 });
  assert.equal(out.products.find((p) => p.id === 'd').page, 2);
  assert.equal(out.rankOffset, 0);
  assert.equal(out.perPage, 3);
});

test('pages 3–4: the 2 pages before are counted as full pages', () => {
  // 3 organic products a page → pages 1–2 hold 6 → page 3 starts at rank 7.
  const out = rankPages([page(3, ['a', 'b', 'c']), page(4, ['d', 'e'])], 'myntra', 3);
  assert.deepEqual(out.products.map((p) => p.rank), [7, 8, 9, 10, 11]);
  assert.equal(out.rankOffset, 6);
  assert.equal(out.products[0].page, 3);
});

test('no pages read → nothing ranked', () => {
  assert.deepEqual(rankPages([], 'amazon', 5).products, []);
});

test('older searches: their saved page range is still read', () => {
  assert.deepEqual(pageRange({ fromPage: 2, toPage: 5 }), { fromPage: 2, toPage: 5 });
  assert.deepEqual(pageRange({ pages: 3 }), { fromPage: 1, toPage: 3 }); // saved before ranges existed
});

test('want N: only the first N ranked products are kept, across pages', () => {
  // 3 a page, want 5 → a, b, c from page 1, d, e from page 2; f is not kept.
  const out = rankPages([page(1, ['a', 'b', 'c']), page(2, ['d', 'e', 'f'])], 'flipkart', 1, 5);
  assert.deepEqual(out.products.map((p) => [p.id, p.rank, p.page]), [['a', 1, 1], ['b', 2, 1], ['c', 3, 1], ['d', 4, 2], ['e', 5, 2]]);
});

test('want N: ads shown before the Nth are kept without a rank; repeats are skipped', () => {
  const out = rankPages([page(1, ['ad1', 'a', 'b'], ['ad1']), page(2, ['b', 'ad2', 'c', 'd'], ['ad2'])], 'amazon', 1, 3);
  assert.deepEqual(out.products.map((p) => [p.id, p.rank]), [['ad1', null], ['a', 1], ['b', 2], ['ad2', null], ['c', 3]]);
});

test('want N bigger than what the pages hold → everything they gave', () => {
  const out = rankPages([page(1, ['a', 'b'])], 'meesho', 1, 100);
  assert.equal(out.products.length, 2);
});

test('a page is counted against the pages before it: listed, new, ads, new ranked', () => {
  const ps = (ids, ads = []) => ids.map((id) => ({ id, link: `https://x/${id}`, sponsored: ads.includes(id) }));
  const seen = new Set();
  assert.deepEqual(countPage(ps(['a', 'b', 'ad1', 'c'], ['ad1']), seen), { shown: 4, added: 4, ads: 1, organic: 3 });
  // page 2 repeats b and c — only d and e are new; the same id twice on one page counts once
  assert.deepEqual(countPage(ps(['b', 'c', 'd', 'e', 'e']), seen), { shown: 5, added: 2, ads: 0, organic: 2 });
  assert.deepEqual(countPage(ps(['a', 'd']), seen), { shown: 2, added: 0, ads: 0, organic: 0 }); // nothing new: results ended
  assert.equal(seen.size, 6); // a, b, ad1, c, d, e
});
