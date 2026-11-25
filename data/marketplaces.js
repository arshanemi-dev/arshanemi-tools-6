// The marketplaces Product Research searches. Each one: how to build its
// search-results URL for a keyword/category and a page number, which host its
// product links live on, and its badge colours. The parsing itself is in
// lib/scraper/platforms/<id>.js. A new marketplace = one entry here + one
// parser file there.
//
// Pages: each search reads a RANGE of result pages per marketplace — from
// page `fromPage` to page `toPage` (1-based, both included). A product's Rank
// is its position in the listing, ads left out (see lib/scraper/runSearch.js).
// A range that starts after page 1 counts the pages before it as full pages.

const q = (s) => encodeURIComponent(String(s).trim());
const slugQ = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const MARKETPLACES = [
  {
    id: 'amazon',
    name: 'Amazon',
    host: 'amazon.in',
    color: '#ff9900',
    pageParam: 'page',
    productRe: /\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i,
    searchUrl: (query, page) => `https://www.amazon.in/s?k=${q(query)}${page > 1 ? `&page=${page}` : ''}`,
  },
  {
    id: 'flipkart',
    name: 'Flipkart',
    host: 'flipkart.com',
    color: '#2874f0',
    pageParam: 'page',
    productRe: /\/p\/itm[a-z0-9]+/i,
    searchUrl: (query, page) => `https://www.flipkart.com/search?q=${q(query)}${page > 1 ? `&page=${page}` : ''}`,
  },
  {
    id: 'meesho',
    name: 'Meesho',
    host: 'meesho.com',
    color: '#9f2089',
    pageParam: 'page',
    productRe: /\/p\/[a-z0-9]+\/?$/i,
    // Its result page is filled in by JavaScript after it loads — read it
    // through SCRAPER_API_URL with JS rendering on (e.g. render_js=true).
    needsJs: true,
    // What to wait for in the browser before the page counts as loaded: a
    // product link (scraping services that run a browser wait for it).
    waitSelector: 'a[href*="/p/"]',
    // Scraping services never used for it. Scrape.do meets Meesho's Akamai
    // wall with a bypass that skips the browser — the page comes back before
    // the products load (tested 25 Nov 2026) and still costs 10 credits.
    avoid: ['scrapedo'],
    searchUrl: (query, page) => `https://www.meesho.com/search?q=${q(query)}${page > 1 ? `&page=${page}` : ''}`,
  },
  {
    id: 'myntra',
    name: 'Myntra',
    host: 'myntra.com',
    color: '#ff3f6c',
    pageParam: 'p',
    productRe: /\/\d+\/buy\/?$/i,
    searchUrl: (query, page) => `https://www.myntra.com/${slugQ(query)}?rawQuery=${q(query)}${page > 1 ? `&p=${page}` : ''}`,
  },
  {
    id: 'snapdeal',
    name: 'Snapdeal',
    host: 'snapdeal.com',
    color: '#e40046',
    pageParam: 'page',
    productRe: /\/product\//i,
    searchUrl: (query, page) => `https://www.snapdeal.com/search?keyword=${q(query)}&sort=rlvncy${page > 1 ? `&page=${page}` : ''}`,
  },
];

export const MARKETPLACE_IDS = MARKETPLACES.map((m) => m.id);
export const marketplaceById = (id) => MARKETPLACES.find((m) => m.id === id) || null;
export const marketplaceName = (id) => marketplaceById(id)?.name || (id ? id[0].toUpperCase() + id.slice(1) : 'Other');

// A product link → its marketplace id (for an imported sheet's rows), or 'other'.
export function marketplaceOfLink(link) {
  try {
    const host = new URL(String(link).trim()).hostname.replace(/^www\./, '');
    return MARKETPLACES.find((m) => host === m.host || host.endsWith(`.${m.host}`))?.id || 'other';
  } catch {
    return 'other';
  }
}

// ── URL searches ────────────────────────────────────────────────────────────
// Instead of a keyword, a link to any listing page the user already looks at
// — a category, a filtered search, a brand store. Its pages are read the
// same way; the marketplace comes from the link.
export const MAX_URLS = 5;

// Tracking bits a marketplace adds to links — dropped, so the same page
// pasted twice is the same search (and never charged twice).
const TRACKING = /^(utm_.*|ref|ref_|otracker\d*|fm|iid|ppt|ppn|ssid|qid|sprefix|crid|_encoding|pf_rd_.*|pd_rd_.*|srsltid|gclid|fbclid|affid|affExtParam\d*)$/i;

// A pasted link → { url, platform } (cleaned: https, no page number, no
// tracking, params in a fixed order) or { error } in plain words.
export function readListingUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return { error: 'That isn’t a link — paste the full address, starting with https://' };
  }
  if (!/^https?:$/.test(u.protocol)) return { error: 'Paste a web link (https://…)' };
  const platform = marketplaceOfLink(u.href);
  const market = marketplaceById(platform);
  if (!market) return { error: `Only ${MARKETPLACES.map((m) => m.name).join(', ')} links can be read` };
  if (market.productRe.test(u.pathname)) return { error: `That’s one product’s page — paste a category or search results page from ${market.name}` };
  u.protocol = 'https:';
  u.hash = '';
  const kept = [...u.searchParams].filter(([k]) => k !== market.pageParam && !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
  u.search = new URLSearchParams(kept).toString();
  return { url: u.toString(), platform };
}

// The listing link for one page of it.
export function pageUrlFor(platform, url, page) {
  const market = marketplaceById(platform);
  const u = new URL(url);
  if (page > 1) u.searchParams.set(market?.pageParam || 'page', String(page));
  else u.searchParams.delete(market?.pageParam || 'page');
  return u.toString();
}

// A short, readable name for a listing link: its search words when it has
// them, else the last meaningful part of its path — "Flipkart · womens kurtas".
export function listingLabel(url) {
  try {
    const u = new URL(url);
    const words = ['q', 'k', 'keyword', 'rawQuery', 'query', 'searchTerm'].map((k) => u.searchParams.get(k)).find(Boolean);
    const parts = u.pathname.split('/').filter((p) => p && !/^(s|search|pr|pl|b|c|products?|[a-z0-9]{1,4}|\d+)$/i.test(p));
    const name = (words || parts[parts.length - 1] || u.hostname).replace(/[-_+]+/g, ' ').trim();
    return `${marketplaceName(marketplaceOfLink(url))} · ${name.slice(0, 60)}`;
  } catch {
    return String(url).slice(0, 60);
  }
}

// The page range picker: any From / To up to MAX_PAGE, at most MAX_SPAN pages
// in one search (each page is one more request to the marketplace).
export const MAX_PAGE = 20;
export const MAX_SPAN = 10;
export const DEFAULT_RANGE = { fromPage: 1, toPage: 3 };

// A search's / track's page range → { fromPage, toPage }. Entries saved before
// ranges existed carry `pages` (= pages 1 to N).
export function pageRange(v) {
  const from = Math.round(Number(v?.fromPage)) || 1;
  const to = Math.round(Number(v?.toPage ?? v?.pages)) || from;
  return { fromPage: from, toPage: to };
}

// Is a picked range allowed? → null, or the reason it isn't (plain words).
export function rangeProblem({ fromPage, toPage }) {
  if (!Number.isInteger(fromPage) || !Number.isInteger(toPage) || fromPage < 1 || toPage < 1) return 'Pick a From page and a To page';
  if (toPage < fromPage) return 'The To page can’t be before the From page';
  if (toPage > MAX_PAGE) return `Pages go up to ${MAX_PAGE}`;
  if (toPage - fromPage + 1 > MAX_SPAN) return `At most ${MAX_SPAN} pages in one search`;
  return null;
}

// "page 4" / "pages 1–3"
export const rangeLabel = (v) => {
  const { fromPage, toPage } = pageRange(v);
  return fromPage === toPage ? `page ${fromPage}` : `pages ${fromPage}–${toPage}`;
};
