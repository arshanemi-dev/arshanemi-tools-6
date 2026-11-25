// One marketplace page → its HTML, through a chain of scraping services.
// Server-only.
//
// Marketplaces show robot checks to requests from cloud servers, so pages go
// through scraping services, tried in SCRAPER_ORDER (default
// "firecrawl,scrapedo,custom,direct"); a service with no key set is skipped:
//
//   firecrawl  FIRECRAWL_API_KEY — POST api.firecrawl.dev/v2/scrape. Renders
//              JavaScript (Meesho works), proxy "auto" retries a blocked page
//              with stronger proxies at no extra cost. maxAge 0: always a
//              fresh page — its default would serve a copy up to 2 days old,
//              which would make every daily rank wrong.
//   scrapedo   SCRAPEDO_TOKEN — GET api.scrape.do. Cheap datacenter proxy
//              first (1 credit); only if the marketplace blocks that, again
//              with residential proxies (super=true, 10 / 25 with JS) —
//              SCRAPEDO_SUPER=auto (default) | always | never. render=true
//              only for marketplaces that need JavaScript.
//   custom     SCRAPER_API_URL / SCRAPER_API_URL_<MARKETPLACE> — any other
//              service's URL template with {url} in it.
//   direct     A plain request with a browser's headers. Free; works from a
//              home connection for most marketplaces, never for Meesho.
//
// The next service is used when one runs out of credits (Firecrawl 402,
// Scrape.do 401 — that service is then skipped for OUT_COOLDOWN_MS, not
// asked again on every page), fails, times out, or returns a robot check.
// Keys/tokens never appear in an error message or a log.

import { env } from '@/lib/env';
import { marketplaceById } from '@/data/marketplaces';

export class BlockedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BlockedError';
  }
}
class OutOfCreditsError extends Error {}
class RetryableError extends Error {}

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
];

const BLOCK_SIGNS = [
  /api-services-support@amazon\.com/i,
  /Enter the characters you see below/i,
  /\/errors\/validateCaptcha/i,
  /are you a human/i,
  /captcha-delivery|px-captcha|cf-chl-|challenge-platform/i,
  /Access Denied<\/title>/i,
  /Request blocked/i,
  /<title>\s*Site Maintenance\s*<\/title>/i, // Myntra's answer to a proxy it doesn't like
];
// A real results page is tens of KB; anything this small is an error page.
const MIN_PAGE_BYTES = 2000;
const BLOCK_STATUS = [403, 429, 503, 529];
export const looksBlocked = (html) => BLOCK_SIGNS.some((re) => re.test(String(html).slice(0, 200_000)));

const OUT_COOLDOWN_MS = 60 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Shared by every route in this process: a service out of credits is set
// aside for everyone, not re-asked by each request.
const state = (globalThis.__scraperState ??= { outUntil: {}, outReason: {} });

const templateFor = (platform) => (platform && env[`SCRAPER_API_URL_${String(platform).toUpperCase()}`]) || env.SCRAPER_API_URL || null;

// ── the services ────────────────────────────────────────────────────────────
// get(url, opts) → { html, status } (status = the marketplace's own HTTP
// status when the service reports it). Throws OutOfCreditsError,
// RetryableError (busy / try again), or Error.
const PROVIDERS = {
  firecrawl: {
    name: 'Firecrawl',
    ready: () => !!env.FIRECRAWL_API_KEY,
    levels: [{}],
    async get(url, { js, timeoutMs }) {
      const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          formats: ['rawHtml'],
          onlyMainContent: false,
          maxAge: 0,
          proxy: 'auto',
          location: { country: 'IN', languages: ['en-IN'] },
          waitFor: js ? 2500 : 0,
          timeout: Math.max(5000, timeoutMs - 3000),
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 402) throw new OutOfCreditsError('Firecrawl has no credits left');
      if (res.status === 401 || res.status === 403) throw new OutOfCreditsError('Firecrawl did not accept the API key');
      if (res.status === 429 || res.status >= 500) throw new RetryableError(`Firecrawl is busy (HTTP ${res.status})`);
      if (!res.ok || !body?.success) throw new Error(`Firecrawl: ${String(body?.error || `HTTP ${res.status}`).slice(0, 160)}`);
      return { html: body.data?.rawHtml || '', status: Number(body.data?.metadata?.statusCode) || 200 };
    },
  },
  scrapedo: {
    name: 'Scrape.do',
    ready: () => !!env.SCRAPEDO_TOKEN,
    levels: () => ({ always: [{ super: true }], never: [{}] }[env.SCRAPEDO_SUPER] || [{}, { super: true }]),
    async get(url, { js, waitSelector, timeoutMs, level }) {
      const qs = new URLSearchParams({ token: env.SCRAPEDO_TOKEN, url, geoCode: 'in', timeout: String(Math.max(5000, timeoutMs - 3000)) });
      if (js) {
        // Its browser returns at DOMContentLoaded by default — before a page
        // like Meesho's has fetched its products. Wait for the network to
        // settle and for a product to be on the page.
        qs.set('render', 'true');
        qs.set('waitUntil', 'networkidle2');
        if (waitSelector) qs.set('waitSelector', waitSelector);
      }
      if (level.super) qs.set('super', 'true');
      const res = await fetch(`https://api.scrape.do/?${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
      const html = await res.text();
      if (res.status === 401) throw new OutOfCreditsError('Scrape.do has no credits left (or the token was refused)');
      if (res.status === 429 || res.status === 502 || res.status === 510) throw new RetryableError(`Scrape.do is busy (HTTP ${res.status})`);
      return { html, status: res.status };
    },
  },
  custom: {
    name: 'Scraping API',
    ready: (platform) => !!templateFor(platform),
    levels: [{}],
    async get(url, { timeoutMs, platform }) {
      const res = await fetch(templateFor(platform).replace('{url}', encodeURIComponent(url)), { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 401 || res.status === 402) throw new OutOfCreditsError(`The scraping API refused the request (HTTP ${res.status})`);
      if (res.status === 429 || res.status >= 500) throw new RetryableError(`The scraping API is busy (HTTP ${res.status})`);
      return { html: await res.text(), status: res.status };
    },
  },
  direct: {
    name: 'Direct',
    ready: () => true,
    noJs: true, // can't run a page's JavaScript — skipped for Meesho
    levels: [{}],
    async get(url, { timeoutMs, attempt }) {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UAS[(attempt + url.length) % UAS.length],
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Upgrade-Insecure-Requests': '1',
        },
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { html: await res.text(), status: res.status };
    },
  },
};

const order = () => String(env.SCRAPER_ORDER).split(',').map((s) => s.trim().toLowerCase()).filter((s) => PROVIDERS[s]);

// The services that will be tried for a marketplace, in order — minus the
// ones it is known not to work with (data/marketplaces.js `avoid`).
export function routeFor(platform, { js = false } = {}) {
  const avoid = marketplaceById(platform)?.avoid || [];
  return order().filter((id) => PROVIDERS[id].ready(platform) && !(js && PROVIDERS[id].noJs) && !avoid.includes(id));
}
// Is any service that can run JavaScript set up for this marketplace?
export const usingScraperApi = (platform) => routeFor(platform, { js: true }).length > 0;
// "Firecrawl → Scrape.do → Direct", for the setup check.
export const routeName = (platform, opts) => routeFor(platform, opts).map((id) => PROVIDERS[id].name).join(' → ') || 'none';
// Services set aside right now for running out of credits → [{ id, reason, until }].
export const outOfCredits = () => Object.entries(state.outUntil)
  .filter(([, until]) => until > Date.now())
  .map(([id, until]) => ({ id, reason: state.outReason[id], until: new Date(until).toISOString() }));

// → { html, via } — via = the service that delivered ("firecrawl",
// "scrapedo+super", "direct"…). Throws BlockedError when every service got a
// robot check, Error otherwise; the message lists what each one said.
// `only` = try just this service (the setup check's --via); `exclude` =
// services not to use this time (runSearch: the one whose page had no products).
export async function fetchPage(url, { platform = null, js = false, waitSelector = null, only = null, exclude = [], timeoutMs = env.SCRAPER_TIMEOUT_MS } = {}) {
  const tried = [];
  let blocked = false;
  const ids = (only ? [only].filter((id) => PROVIDERS[id]?.ready(platform)) : routeFor(platform, { js })).filter((id) => !exclude.includes(id));
  if (!ids.length) throw new Error(only ? `${only} is not set up (no key in .env)` : exclude.length ? 'no other scraping service left to try' : 'No scraping service is set up for this marketplace');

  for (const id of ids) {
    const p = PROVIDERS[id];
    if (!only && state.outUntil[id] > Date.now()) {
      tried.push(`${p.name}: skipped — ${state.outReason[id]}`);
      continue;
    }
    const levels = typeof p.levels === 'function' ? p.levels() : p.levels;
    service: for (const level of levels) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const { html, status } = await p.get(url, { js, waitSelector, timeoutMs, level, attempt, platform });
          if (looksBlocked(html) || BLOCK_STATUS.includes(status)) throw new BlockedError(`robot check${status && status !== 200 ? ` (HTTP ${status})` : ''}`);
          if (status >= 400) throw new Error(`the marketplace answered HTTP ${status}`);
          if (String(html).length < MIN_PAGE_BYTES) throw new BlockedError('a tiny error page came back');
          return { html, via: `${id}${level.super ? '+super' : ''}` };
        } catch (err) {
          const label = `${p.name}${level.super ? ' (residential)' : ''}`;
          if (err instanceof OutOfCreditsError) {
            state.outUntil[id] = Date.now() + OUT_COOLDOWN_MS;
            state.outReason[id] = err.message;
            console.warn(`[scraper] ${err.message} — using the next service for the next hour`);
            tried.push(`${label}: ${err.message}`);
            break service;
          }
          if (err instanceof BlockedError) {
            blocked = true;
            tried.push(`${label}: ${err.message}`);
            continue service; // a stronger level of this service, else the next service
          }
          if (err instanceof RetryableError && attempt < 2) {
            await sleep(1500 * (attempt + 1) + Math.random() * 800);
            continue;
          }
          const msg = err?.name === 'TimeoutError' ? `timed out after ${Math.round(timeoutMs / 1000)}s` : err.message;
          tried.push(`${label}: ${msg}`);
          break service; // anything else: next service
        }
      }
    }
  }
  const message = tried.join(' · ');
  throw blocked ? new BlockedError(message) : new Error(message);
}
