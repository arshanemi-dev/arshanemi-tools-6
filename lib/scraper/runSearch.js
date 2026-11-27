// One keyword on one marketplace → today's ranked product list. Server-only.
//
// Two ways to read (both keep each product once — its first, best position):
//   want N         the entries' way: start at page 1 and go on to the next
//                  page by itself until N ranked products are in hand — or
//                  the results run out, or MAX_READ_PAGES pages were read.
//                  Only the first N are kept. A market place that loads more
//                  as you scroll (data/marketplaces.js `scroll` — Meesho) has
//                  no next page: page 1 is opened once and scrolled about
//                  N ÷ perLoad times (lib/scraper/fetchPage.js, at most
//                  MAX_SCROLLS) instead.
//   fromPage..toPage  exactly those pages (older searches, the setup check).
// The products are numbered:
//   rank  = position among the organic (non-sponsored) results, 1-based —
//           "product shown 5th = rank 5". A paid ad's slot is bought, not
//           earned, so ads get no rank; they're kept with `sponsored: true`.
//   page  = the results page it was found on.
// A range that starts after page 1 doesn't read the pages before it, so they
// are counted as full pages: (fromPage − 1) × the organic products on the
// first page read (rankPages). On Flipkart (40 a page) the first product of
// page 3 is rank 81. `rankOffset` says how many were counted that way.
// Stops early when a page adds nothing new (the results ran out).
// `stoppedBy` says why reading stopped: 'target' (N reached) · 'ended' (the
// results ran out) · 'failed' (a page couldn't be read) · 'limit' (the page
// limit came first) · 'range' (the last page of fromPage..toPage).
import { marketplaceById, pageUrlFor } from '@/data/marketplaces';
import { MAX_READ_PAGES } from '@/data/entrySettings';
import { BlockedError, MAX_SCROLLS, fetchPage, usingScraperApi } from './fetchPage';
import { parseAmazon } from './platforms/amazon';
import { parseFlipkart } from './platforms/flipkart';
import { parseMeesho } from './platforms/meesho';
import { parseMyntra } from './platforms/myntra';
import { parseSnapdeal } from './platforms/snapdeal';
import { countPage, rankPages } from './rank';

export { rankPages };

export const PARSERS = {
  amazon: parseAmazon,
  flipkart: parseFlipkart,
  meesho: parseMeesho,
  myntra: parseMyntra,
  snapdeal: parseSnapdeal,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// → { products, pagesRead, scrolls, rankOffset, perPage, stoppedBy, error: string | null, blocked }
// (scrolls = how many times page 1 was scrolled — 0 unless a scroll site)
// `products` may be non-empty even with an error: what the pages before the
// failure gave is kept.
// `target` = { query } (a keyword search) or { url } (a pasted listing link).
// `only` = use just this scraping service (the setup check's --via).
// `onPage({ page, products, added })` hears each page as it is read —
// products = how many different ones so far (at most `want`), added = how
// many new ones this page gave (the page's live progress).
export async function runSearch(platformId, target, { want = null, fromPage = 1, toPage = null, only = null, onPage = null } = {}) {
  if (want) fromPage = 1;
  const { query = '', url = null } = typeof target === 'string' ? { query: target } : target || {};
  const market = marketplaceById(platformId);
  // A scroll site: page 1 only, scrolled enough for `want` (+1 to spare).
  const scroller = want && market?.scroll ? market.scroll : null;
  const loads = scroller ? Math.ceil(want / scroller.perLoad) : 0;
  const scrolls = scroller ? Math.min(MAX_SCROLLS, loads > 1 ? loads : 0) : 0;
  const lastPage = scroller ? fromPage : want ? fromPage + MAX_READ_PAGES - 1 : toPage ?? fromPage;
  const parser = PARSERS[platformId];
  const via = new Set(); // which scraping services delivered the pages
  // Per page read: { page, shown (products listed), added (new — not on an
  // earlier page), ads } — plus `endedAt` (the page that added nothing new:
  // the results ran out there) or `failedAt` (the page that couldn't be read).
  const pageCounts = [];
  let endedAt = null;
  let failedAt = null;
  // Fewer than `want` after scrolling: 'limit' if it scrolled as far as one
  // read can, else the list ended.
  let stoppedBy = scroller ? (loads > MAX_SCROLLS ? 'limit' : 'ended') : want ? 'limit' : 'range';
  const done = (pages, extra) => ({ ...rankPages(pages, platformId, fromPage, want), pagesRead: pages.length, scrolls: via.has('firecrawl') ? scrolls : 0, via: [...via], pageCounts, endedAt, failedAt, stoppedBy, error: null, blocked: false, ...extra });
  if (!market || !parser) return done([], { stoppedBy: 'failed', error: `Unknown marketplace "${platformId}"` });
  if (market.needsJs && !only && !usingScraperApi(platformId)) {
    return done([], { stoppedBy: 'failed', error: `${market.name} builds its results with JavaScript — set FIRECRAWL_API_KEY in .env to read it` });
  }

  const pages = [];
  const seen = new Set();
  let ranked = 0; // ranked (non-ad) products so far
  for (let page = fromPage; page <= lastPage; page += 1) {
    if (page > fromPage) await sleep(700 + Math.random() * 900); // polite pacing between pages
    // A page with no products at all is suspicious — often a block page in
    // disguise ("Site Maintenance"). The same page is asked for again through
    // the next service before believing it.
    let found = [];
    const exclude = [];
    for (let tries = 0; tries < 3; tries += 1) {
      let got;
      try {
        got = await fetchPage(url ? pageUrlFor(platformId, url, page) : market.searchUrl(query, page), { platform: platformId, js: !!market.needsJs, waitSelector: market.waitSelector || null, only, exclude, scrolls: page === fromPage ? scrolls : 0 });
      } catch (err) {
        if (tries > 0) break; // the services left had nothing better — keep the empty result
        failedAt = page;
        return done(pages, { stoppedBy: 'failed', error: `Page ${page}: ${err.message}`, blocked: err instanceof BlockedError });
      }
      found = parser(got.html);
      if (found.length || only) { via.add(got.via); break; }
      exclude.push(got.via.split('+')[0]);
    }
    const { organic, ...counted } = countPage(found, seen);
    pageCounts.push({ page, ...counted });
    if (!counted.added) {
      endedAt = page;
      stoppedBy = 'ended';
      if (page === fromPage) {
        const error = page > 1
            ? `Page ${page} has no products (the results may end before it, or the layout changed)`
            : 'No products could be read from the results page (the layout may have changed, or the keyword has no results)';
        return done([], { stoppedBy: 'failed', error });
      }
      break;
    }
    pages.push({ page, products: found });
    ranked += organic;
    onPage?.({ page, products: want ? Math.min(seen.size, want) : seen.size, added: counted.added });
    if (want && ranked >= want) { stoppedBy = 'target'; break; }
  }
  return done(pages);
}
