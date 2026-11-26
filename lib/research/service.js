// Server-only glue: bring a search's tracks up to today (with live
// progress), and shape a search for the page.
import { runSearch } from '@/lib/scraper/runSearch';
import { readTrack, saveRun, searchTrackId, urlTrackId } from './store';
import { todayIST } from './time';
import { listingLabel, marketplaceName, marketplaceOfLink, pageRange } from '@/data/marketplaces';

// A search → its jobs, one per track: [{ id, platform, query, url, label }].
//   kind 'search' — one keyword on each of its marketplaces;
//   kind 'url'    — each pasted listing link (its marketplace from the link).
// `search` = { kind, query, platforms, urls, fromPage, toPage } (an older
// search may carry `pages` — pageRange reads it).
export function jobsOf(search) {
  const range = pageRange(search);
  if (search.kind === 'url') {
    return (search.urls || []).map((url) => {
      const platform = marketplaceOfLink(url);
      return { id: urlTrackId(platform, url, range), platform, query: listingLabel(url), url, label: listingLabel(url) };
    });
  }
  return (search.platforms || []).map((platform) => ({
    id: searchTrackId(platform, search.query, range), platform, query: search.query, url: null, label: marketplaceName(platform),
  }));
}

// Every job's track → today's snapshot, reading only those that don't have
// one yet (a track another user already read today is reused as it is).
// Jobs run in parallel. `onProgress(event)` hears, per job (by `id`):
//   { id, state: 'reading', page, pages, products, added }  after each page
//     read (added = the new products that page gave)
//   { id, state: 'cached' | 'done' | 'failed', products, error }  at the end
// → [{ ...job, track, fresh, error, blocked }]
export function ensureFresh(search, opts) {
  const range = pageRange(search);
  return ensureJobs(jobsOf(search).map((job) => ({ ...job, ...range })), opts);
}

// The same for any list of jobs, each with its own page range:
// [{ id (track id), platform, query, url, label, fromPage, toPage,
// maxPerPage? (keep only the first N products of each page) }].
// `force` = read again even if already read today (an admin's "Search now").
export async function ensureJobs(jobs, { force = false, onProgress = () => {} } = {}) {
  const today = todayIST();
  return Promise.all(jobs.map(async (job) => {
    const range = pageRange(job);
    const pages = range.toPage - range.fromPage + 1;
    const count = (t) => Object.keys(t?.products || {}).length;
    const existing = await readTrack(job.id);
    if (!force && existing?.lastRunDate === today) {
      onProgress({ id: job.id, state: 'cached', products: count(existing) });
      return { ...job, track: existing, fresh: false, error: null, blocked: false };
    }
    onProgress({ id: job.id, state: 'reading', page: 0, pages, products: 0 });
    const result = await runSearch(job.platform, { query: job.query, url: job.url }, {
      ...range,
      maxPerPage: job.maxPerPage || null,
      onPage: ({ page, products, added }) => onProgress({ id: job.id, state: 'reading', page: page - range.fromPage + 1, pages, products, added }),
    });
    const track = await saveRun({ id: job.id, platform: job.platform, query: job.query, url: job.url, ...range }, result, today);
    onProgress({ id: job.id, state: result.products.length ? 'done' : 'failed', products: result.products.length, error: result.error });
    return { ...job, track, fresh: true, error: result.error, blocked: result.blocked };
  }));
}

// The jobs as the page lists them while they run.
export const planOf = (search) => jobsOf(search).map(({ id, platform, label }) => ({ id, platform, label }));

// What the page gets for a search: the search entry + its tracks (ones never
// read successfully dropped) + one status line per track.
export async function searchPayload(search) {
  const tracks = (await Promise.all((search.trackIds || []).map(readTrack))).filter(Boolean);
  return {
    search,
    tracks,
    status: tracks.map((t) => ({
      id: t.id,
      platform: t.platform,
      label: t.url ? listingLabel(t.url) : marketplaceName(t.platform),
      lastRunDate: t.lastRunDate,
      lastRun: t.runs?.[0] || null,
      // How many ranks above the range's first page were counted as full
      // pages (0 for a range starting at page 1) — the page says so.
      rankOffset: t.runs?.find((r) => r.count)?.rankOffset || 0,
      perPage: t.runs?.find((r) => r.count)?.perPage || 0,
      products: Object.keys(t.products || {}).length,
    })),
  };
}
