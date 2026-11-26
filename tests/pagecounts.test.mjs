import test from 'node:test';
import assert from 'node:assert/strict';
import { countPage } from '../lib/scraper/rank.js';
import { hasPageProblem, pageCountsText, pageStates } from '../lib/research/pageCounts.js';

const ps = (ids, ads = []) => ids.map((id) => ({ id, link: `https://x/${id}`, sponsored: ads.includes(id) }));

test('a page is counted against the pages before it: listed, new, ads', () => {
  const seen = new Set();
  assert.deepEqual(countPage(ps(['a', 'b', 'ad1', 'c'], ['ad1']), seen), { shown: 4, added: 4, ads: 1 });
  // page 2 repeats b and c — only d and e are new; the same id twice on one page counts once
  assert.deepEqual(countPage(ps(['b', 'c', 'd', 'e', 'e']), seen), { shown: 5, added: 2, ads: 0 });
  assert.deepEqual(countPage(ps(['a', 'd']), seen), { shown: 2, added: 0, ads: 0 }); // nothing new: results ended
  assert.equal(seen.size, 6); // a, b, ad1, c, d, e
});

const entry = (pageCounts, extra = {}) => ({ kind: 'search', pageCounts, countedRange: { fromPage: 1, toPage: 3 }, endedAt: null, failedAt: null, ...extra });

test('every page added products → their counts and the total', () => {
  const e = entry([{ page: 1, shown: 50, added: 50, ads: 2 }, { page: 2, shown: 48, added: 45, ads: 1 }, { page: 3, shown: 47, added: 47, ads: 0 }]);
  const s = pageStates(e);
  assert.deepEqual(s.pages.map((p) => p.state), ['ok', 'ok', 'ok']);
  assert.equal(s.total, 142);
  assert.equal(s.pages[1].repeats, 3);
  assert.equal(pageCountsText(e), 'p1 50 · p2 45 · p3 47 = 142');
  assert.equal(hasPageProblem(e), false);
});

test('results ran out at page 2 → page 2 "ended", page 3 not read', () => {
  const e = entry([{ page: 1, shown: 20, added: 20, ads: 0 }, { page: 2, shown: 20, added: 0, ads: 0 }], { endedAt: 2 });
  const s = pageStates(e);
  assert.deepEqual(s.pages.map((p) => p.state), ['ok', 'ended', 'skipped']);
  assert.equal(s.stoppedAt, 2);
  assert.equal(pageCountsText(e), 'p1 20 · p2 ended · p3 – = 20');
  assert.equal(hasPageProblem(e), false); // the results simply end — nothing to fix
});

test('a thin page with more results after it is "short"; a thin LAST page is not', () => {
  const mid = entry([{ page: 1, shown: 48, added: 48, ads: 0 }, { page: 2, shown: 9, added: 9, ads: 0 }, { page: 3, shown: 48, added: 48, ads: 0 }]);
  assert.deepEqual(pageStates(mid).pages.map((p) => p.state), ['ok', 'short', 'ok']);
  assert.equal(hasPageProblem(mid), true);
  assert.match(pageCountsText(mid), /p2 9 short/);
  const last = entry([{ page: 1, shown: 48, added: 48, ads: 0 }, { page: 2, shown: 48, added: 48, ads: 0 }, { page: 3, shown: 9, added: 9, ads: 0 }]);
  assert.deepEqual(pageStates(last).pages.map((p) => p.state), ['ok', 'ok', 'ok']);
});

test('page 2 couldn’t be read → p2 failed, p3 not read', () => {
  const e = entry([{ page: 1, shown: 40, added: 40, ads: 0 }], { failedAt: 2, countedError: 'Page 2: blocked' });
  assert.deepEqual(pageStates(e).pages.map((p) => p.state), ['ok', 'failed', 'skipped']);
  assert.equal(hasPageProblem(e), true);
});

test('page 1 listed nothing → "empty"; a Search that read no page at all is a problem too', () => {
  const empty = entry([{ page: 1, shown: 0, added: 0, ads: 0 }], { endedAt: 1 });
  assert.deepEqual(pageStates(empty).pages.map((p) => p.state), ['empty', 'skipped', 'skipped']);
  assert.equal(hasPageProblem(empty), true);
  const none = entry([], { countedError: 'Meesho builds its results with JavaScript' });
  assert.ok(pageStates(none).pages.every((p) => p.state === 'skipped'));
  assert.equal(hasPageProblem(none), true);
});

test('nothing to show: an import, never read, or read before page counts existed', () => {
  assert.equal(pageStates({ kind: 'import', pageCounts: [], countedRange: null }), null);
  assert.equal(pageStates(entry([], { countedRange: null })), null);
  assert.equal(pageCountsText(entry([], { countedRange: null })), '');
});

test('the pages of the read that was counted are shown, not the range set now', () => {
  const e = entry([{ page: 2, shown: 40, added: 40, ads: 0 }, { page: 3, shown: 40, added: 40, ads: 0 }], { countedRange: { fromPage: 2, toPage: 3 } });
  const s = pageStates(e);
  assert.deepEqual([s.fromPage, s.toPage], [2, 3]);
  assert.deepEqual(s.pages.map((p) => p.page), [2, 3]);
});
