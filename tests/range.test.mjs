import test from 'node:test';
import assert from 'node:assert/strict';
import { rankPages } from '../lib/scraper/rank.js';
import { pageRange, rangeLabel, rangeProblem } from '../data/marketplaces.js';

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

test('page range rules', () => {
  assert.deepEqual(pageRange({ fromPage: 2, toPage: 5 }), { fromPage: 2, toPage: 5 });
  assert.deepEqual(pageRange({ pages: 3 }), { fromPage: 1, toPage: 3 }); // saved before ranges existed
  assert.equal(rangeProblem({ fromPage: 2, toPage: 5 }), null);
  assert.match(rangeProblem({ fromPage: 5, toPage: 2 }), /before/);
  assert.match(rangeProblem({ fromPage: 1, toPage: 11 }), /At most 10/);
  assert.match(rangeProblem({ fromPage: 15, toPage: 21 }), /up to 20/);
  assert.equal(rangeLabel({ fromPage: 4, toPage: 4 }), 'page 4');
  assert.equal(rangeLabel({ fromPage: 1, toPage: 3 }), 'pages 1–3');
});
