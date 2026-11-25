// One keyword on one marketplace → today's ranked product list. Server-only.
//
// Reads result pages `fromPage`..`toPage` in order, keeps each product once
// (its first, best position), and numbers them:
//   rank  = position among the organic (non-sponsored) results, 1-based —
//           "product shown 5th = rank 5". A paid ad's slot is bought, not
//           earned, so ads get no rank; they're kept with `sponsored: true`.
//   page  = the results page it was found on.
// A range that starts after page 1 doesn't read the pages before it, so they
// are counted as full pages: (fromPage − 1) × the organic products on the
// first page read (rankPages). On Flipkart (40 a page) the first product of
// page 3 is rank 81. `rankOffset` says how many were counted that way.
// Stops early when a page adds nothing new (the results ran out).
import { marketplaceById, pageUrlFor } from '@/data/marketplaces';
import { BlockedError, fetchPage, usingScraperApi } from './fetchPage';
import { parseAmazon } from './platforms/amazon';
import { parseFlipkart } from './platforms/flipkart';
import { parseMeesho } from './platforms/meesho';
import { parseMyntra } from './platforms/myntra';
import { parseSnapdeal } from './platforms/snapdeal';
import { rankPages } from './rank';

export { rankPages };

export const PARSERS = {
  amazon: parseAmazon,
  flipkart: parseFlipkart,
  meesho: parseMeesho,
  myntra: parseMyntra,
  snapdeal: parseSnapdeal,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// → { products, pagesRead, rankOffset, perPage, error: string | null, blocked }
// `products` may be non-empty even with an error: what the pages before the
// failure gave is kept.
// `target` = { query } (a keyword search) or { url } (a pasted listing link).
// `only` = use just this scraping service (the setup check's --via).
// `onPage({ page, products })` hears each page as it is read — products =
// how many different ones so far (the page's live progress).
export async function runSearch(platformId, target, { fromPage = 1, toPage = fromPage, only = null, onPage = null } = {}) {
  const { query = '', url = null } = typeof target === 'string' ? { query: target } : target || {};
  const market = marketplaceById(platformId);
  const parser = PARSERS[platformId];
  const via = new Set(); // which scraping services delivered the pages
  const done = (pages, extra) => ({ ...rankPages(pages, platformId, fromPage), pagesRead: pages.length, via: [...via], error: null, blocked: false, ...extra });
  if (!market || !parser) return done([], { error: `Unknown marketplace "${platformId}"` });
  if (market.needsJs && !only && !usingScraperApi(platformId)) {
    return done([], { error: `${market.name} builds its results with JavaScript — set FIRECRAWL_API_KEY in .env to read it` });
  }

  const pages = [];
  const seen = new Set();
  for (let page = fromPage; page <= toPage; page += 1) {
    if (page > fromPage) await sleep(700 + Math.random() * 900); // polite pacing between pages
    // A page with no products at all is suspicious — often a block page in
    // disguise ("Site Maintenance"). The same page is asked for again through
    // the next service before believing it.
    let found = [];
    const exclude = [];
    for (let tries = 0; tries < 3; tries += 1) {
      let got;
      try {
        got = await fetchPage(url ? pageUrlFor(platformId, url, page) : market.searchUrl(query, page), { platform: platformId, js: !!market.needsJs, waitSelector: market.waitSelector || null, only, exclude });
      } catch (err) {
        if (tries > 0) break; // the services left had nothing better — keep the empty result
        return done(pages, { error: `Page ${page}: ${err.message}`, blocked: err instanceof BlockedError });
      }
      found = parser(got.html);
      if (found.length || only) { via.add(got.via); break; }
      exclude.push(got.via.split('+')[0]);
    }
    const added = found.filter((p) => !seen.has(String(p.id || p.link))).length;
    for (const p of found) seen.add(String(p.id || p.link));
    if (!added) {
      if (page === fromPage) {
        const error = page > 1
            ? `Page ${page} has no products (the results may end before it, or the layout changed)`
            : 'No products could be read from the results page (the layout may have changed, or the keyword has no results)';
        return done([], { error });
      }
      break;
    }
    pages.push({ page, products: found });
    onPage?.({ page, products: seen.size });
  }
  return done(pages);
}
