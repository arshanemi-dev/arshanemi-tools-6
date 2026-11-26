// Products per page — how each page of an entry's last Search went, for the
// New Search table's "Products / Page" column. Pure (the page and the tests).
//
// `entry` = an entry with stats (lib/research/cleanup.js entryStats):
//   pageCounts   [{ page, shown, added, ads }] — one per page read, in order
//                (lib/scraper/runSearch.js). shown = listed on the page (ads
//                too), added = new ones (not already on an earlier page).
//   endedAt      the page that added nothing: the results ran out there
//   failedAt     the page that couldn't be read: reading stopped there
//   countedRange { fromPage, toPage } — the pages that Search asked for
//
// Each page of that range gets a state:
//   'ok'       it added products
//   'short'    it added products, but listed under half as many as the
//              fullest page while a LATER page still added new ones — the
//              results didn't end there, so it probably didn't load fully
//   'ended'    it listed products, all already on an earlier page, or listed
//              nothing: the results end here
//   'empty'    the FIRST page listed nothing — no products could be read
//   'failed'   it couldn't be read
//   'skipped'  not read: reading had already stopped at an earlier page

export const SHORT_SHARE = 0.5;

// → null when there is nothing to show (an imported sheet, never read, or
// only read before page counts existed), else
// { pages: [{ page, state, shown, added, ads, repeats }], total, fullest,
//   stoppedAt, fromPage, toPage }. total = the products that Search found
// (every page's new ones added up).
export function pageStates(entry) {
  if (!entry || entry.kind === 'import' || !entry.countedRange) return null;
  const counts = Array.isArray(entry.pageCounts) ? entry.pageCounts : [];
  const pagesSeen = counts.map((c) => c.page);
  const fromPage = entry.countedRange.fromPage ?? (pagesSeen.length ? Math.min(...pagesSeen) : null);
  const toPage = entry.countedRange.toPage ?? (pagesSeen.length ? Math.max(...pagesSeen) : null);
  if (!fromPage || !toPage) return null;

  const byPage = new Map(counts.map((c) => [c.page, c]));
  const fullest = Math.max(0, ...counts.map((c) => c.shown || 0));
  const lastAdding = Math.max(0, ...counts.filter((c) => c.added > 0).map((c) => c.page));
  const pages = [];
  for (let page = fromPage; page <= toPage; page += 1) {
    const c = byPage.get(page);
    let state;
    if (entry.failedAt === page) state = 'failed';
    else if (!c) state = 'skipped';
    else if (c.added > 0) state = page < lastAdding && c.shown < fullest * SHORT_SHARE ? 'short' : 'ok';
    else state = page === fromPage && !c.shown ? 'empty' : 'ended';
    pages.push({
      page, state,
      shown: c?.shown ?? 0, added: c?.added ?? 0, ads: c?.ads ?? 0,
      repeats: c ? Math.max(0, c.shown - c.added) : 0,
    });
  }
  return {
    pages,
    total: counts.reduce((n, c) => n + (c.added || 0), 0),
    fullest,
    stoppedAt: entry.failedAt ?? entry.endedAt ?? null,
    fromPage,
    toPage,
  };
}

// One page as short text: "p1 48", "p2 12 short", "p3 ended", "p2 failed", "p3 –".
const WORD = { short: 'short', ended: 'ended', empty: '0', failed: 'failed', skipped: '–' };
export const pageText = (p) => (p.state === 'ok' ? `p${p.page} ${p.added}` : p.state === 'short' ? `p${p.page} ${p.added} short` : `p${p.page} ${WORD[p.state]}`);

// The whole cell as text (what the column's filter lists): "p1 48 · p2 52 · p3 57 = 157".
export function pageCountsText(entry) {
  const s = pageStates(entry);
  if (!s) return '';
  return `${s.pages.map(pageText).join(' · ')} = ${s.total}`;
}

// Does the last Search have a page worth a second look (cut short, failed,
// or nothing read at all)?
export function hasPageProblem(entry) {
  const s = pageStates(entry);
  return !!s && (s.pages.every((p) => p.state === 'skipped') || s.pages.some((p) => p.state === 'short' || p.state === 'failed' || p.state === 'empty'));
}
