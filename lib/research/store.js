// Product Research storage. Server-only. JSON files through lib/blobStore.js:
//
//   research/tracks/<trackId>   one marketplace + keyword + page range — its
//                               products and their DAILY history. Shared: two
//                               users tracking "kurti" on Meesho, pages 1–3,
//                               read the same track (one scrape a day serves both).
//   research/track-index        [{ id, platform, query, url?, fromPage, toPage,
//                               lastRunDate, owners: [userId] }] — what the
//                               daily cron refreshes, and who still uses it.
//   research/users/<userId>     { searches: [...] } — that user's list.
//
// A track:
// { id, kind: 'search' | 'import', platform, query, fromPage, toPage, createdAt,
//   lastRunAt, lastRunDate, runs: [{ date, at, count, pagesRead, rankOffset,
//   perPage, error, blocked }],
//   products: { [key]: { key, id, platform, link, title, image, brand,
//     firstSeen, lastSeen, h: { [YYYY-MM-DD]: { r, pg, p, m, rt, rv, ad } } } } }
// h = one day's snapshot: r rank (null for an ad), pg page, p price, m MRP,
// rt rating, rv reviews/ratings count, b bought in past month (Amazon only —
// its "1K+ bought in past month", at least this many), ad 1 when sponsored.
import { createHash } from 'node:crypto';
import { deleteBlobJsonMany, readBlobJson, writeBlobJson } from '@/lib/blobStore';
import { todayIST } from './time';
import { pageRange } from '@/data/marketplaces';

const MAX_DAYS = 400; // history kept per product
const MAX_RUNS = 60;

const trackKey = (id) => `research/tracks/${id}`;
const userKey = (userId) => `research/users/${String(userId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
const INDEX_KEY = 'research/track-index';

export const normQuery = (q) => String(q || '').trim().replace(/\s+/g, ' ').toLowerCase();
const slug = (s) => normQuery(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'q';
const hash = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 10);

// Pages 1–N keep the id they had before ranges existed (…-pN).
export function searchTrackId(platform, query, range) {
  const { fromPage, toPage } = pageRange(range);
  const pages = fromPage === 1 ? `p${toPage}` : `p${fromPage}-${toPage}`;
  return `${platform}-${slug(query)}-${hash(normQuery(query))}-${pages}`;
}
// A pasted listing link (already cleaned by readListingUrl) + page range.
export function urlTrackId(platform, url, range) {
  const { fromPage, toPage } = pageRange(range);
  return `url-${platform}-${hash(url)}-p${fromPage}-${toPage}`;
}

export const importTrackId = (userId, name) => `import-${hash(userId)}-${slug(name)}-${hash(`${userId}:${normQuery(name)}`)}`;

// Writes to one key from this process go one at a time, so two refreshes of
// the same track don't each overwrite the other's half.
const locks = (globalThis.__researchLocks ??= new Map());
async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  let release;
  const next = new Promise((r) => { release = r; });
  locks.set(key, prev.then(() => next));
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === next) locks.delete(key);
  }
}

// ── tracks ──────────────────────────────────────────────────────────────────
export const readTrack = (id) => readBlobJson(trackKey(id), null);

function emptyTrack({ id, kind = 'search', platform, query, url = null, fromPage = 0, toPage = 0 }) {
  return { id, kind, platform, query, ...(url ? { url } : {}), fromPage, toPage, createdAt: new Date().toISOString(), lastRunAt: null, lastRunDate: null, runs: [], products: {} };
}

function pruneHistory(h) {
  const days = Object.keys(h).sort();
  if (days.length <= MAX_DAYS) return h;
  for (const d of days.slice(0, days.length - MAX_DAYS)) delete h[d];
  return h;
}

const snap = (p) => ({ r: p.rank ?? null, pg: p.page ?? null, p: p.price ?? null, m: p.mrp ?? null, rt: p.rating ?? null, rv: p.reviews ?? null, ...(p.bought != null ? { b: p.bought } : {}), ...(p.sponsored ? { ad: 1 } : {}) });

// Today's scrape result → into the track. Re-running on the same day
// replaces that day's snapshot (a product no longer listed loses its entry
// for today), it never adds a second one.
export async function saveRun(meta, result, date = todayIST()) {
  return withLock(trackKey(meta.id), async () => {
    const track = (await readTrack(meta.id)) || emptyTrack(meta);
    const ok = result.products.length > 0;
    if (ok) {
      for (const prod of Object.values(track.products)) delete prod.h[date];
      for (const p of result.products) {
        const key = `${p.platform}:${p.id}`;
        const cur = track.products[key] || { key, id: p.id, platform: p.platform, firstSeen: date, h: {} };
        cur.link = p.link || cur.link;
        cur.title = p.title || cur.title;
        cur.image = p.image || cur.image || '';
        cur.brand = p.brand || cur.brand || '';
        cur.lastSeen = date;
        cur.h[date] = snap(p);
        pruneHistory(cur.h);
        track.products[key] = cur;
      }
      track.lastRunDate = date;
    }
    track.lastRunAt = new Date().toISOString();
    track.runs = [{ date, at: track.lastRunAt, count: result.products.length, pagesRead: result.pagesRead, rankOffset: result.rankOffset || 0, perPage: result.perPage || 0, via: result.via || [], error: result.error, blocked: !!result.blocked }, ...(track.runs || [])].slice(0, MAX_RUNS);
    await writeBlobJson(trackKey(meta.id), track);
    if (track.kind === 'search') await upsertIndex(track, { create: false });
    return track;
  });
}

// Imported sheet rows → the user's import track. `rows` = [{ link, date
// (YYYY-MM-DD), title?, price?, mrp?, rating?, reviews?, rank?, platform }].
// A (link, date) already there is overwritten by the sheet's values.
export async function saveImport(meta, rows) {
  return withLock(trackKey(meta.id), async () => {
    const track = (await readTrack(meta.id)) || emptyTrack({ ...meta, kind: 'import', platform: 'mixed' });
    for (const row of rows) {
      const key = `${row.platform}:${row.link}`;
      const cur = track.products[key] || { key, id: row.link, platform: row.platform, link: row.link, title: '', image: '', brand: '', firstSeen: row.date, lastSeen: row.date, h: {} };
      if (row.title) cur.title = row.title;
      if (row.date < cur.firstSeen) cur.firstSeen = row.date;
      if (row.date > cur.lastSeen) cur.lastSeen = row.date;
      cur.h[row.date] = snap(row);
      pruneHistory(cur.h);
      track.products[key] = cur;
    }
    const dates = rows.map((r) => r.date).sort();
    track.lastRunDate = [track.lastRunDate, dates[dates.length - 1]].filter(Boolean).sort().pop() || null;
    track.lastRunAt = new Date().toISOString();
    track.runs = [{ date: todayIST(), at: track.lastRunAt, count: rows.length, pagesRead: 0, error: null, blocked: false, imported: true }, ...(track.runs || [])].slice(0, MAX_RUNS);
    await writeBlobJson(trackKey(meta.id), track);
    return track;
  });
}

// ── the cron's index ────────────────────────────────────────────────────────
export const readIndex = async () => (await readBlobJson(INDEX_KEY, [])) || [];

// `create: false` (a scrape) only updates an entry that is already there; a
// track joins the index when a search using it is added to a user's list
// (registerTracks) — so a search that was refused (no coins) or never kept
// isn't scraped every day for nobody. An entry's `owners` = the users whose
// searches use it; when the last one deletes theirs (releaseTracks) the
// entry and the track's data go. (Entries from before owners existed have
// none listed — Settings › Clean up works them out.)
async function upsertIndex(track, { create = true, owner = null } = {}) {
  await withLock(INDEX_KEY, async () => {
    const index = await readIndex();
    const entry = { id: track.id, platform: track.platform, query: track.query, ...(track.url ? { url: track.url } : {}), ...pageRange(track), lastRunDate: track.lastRunDate };
    const i = index.findIndex((e) => e.id === track.id);
    if (i === -1 && !create) return;
    const prev = i === -1 ? {} : index[i];
    const owners = owner ? [...new Set([...(prev.owners || []), String(owner)])] : prev.owners;
    const next = { ...prev, ...entry, ...(owners ? { owners } : {}) };
    if (i === -1) index.push(next);
    else index[i] = next;
    await writeBlobJson(INDEX_KEY, index);
  });
}

export async function registerTracks(tracks, userId) {
  for (const t of tracks) if (t?.kind === 'search') await upsertIndex(t, { owner: userId });
}

export const trackKeyOf = (id) => trackKey(id);

// A user no longer uses these tracks → they leave each one's owners; a
// track nobody owns any more stops being read every day and its data is
// deleted. → { stopped: [ids] } (the ones whose data went).
export async function releaseTracks(userId, trackIds) {
  if (!trackIds.length) return { stopped: [] };
  const stopped = await withLock(INDEX_KEY, async () => {
    const index = await readIndex();
    const gone = [];
    const next = index.filter((e) => {
      if (!trackIds.includes(e.id) || !Array.isArray(e.owners)) return true;
      e.owners = e.owners.filter((o) => o !== String(userId));
      if (e.owners.length) return true;
      gone.push(e.id);
      return false;
    });
    await writeBlobJson(INDEX_KEY, next);
    return gone;
  });
  await deleteBlobJsonMany(stopped.map(trackKey));
  return { stopped };
}

export async function writeIndex(index) {
  await withLock(INDEX_KEY, () => writeBlobJson(INDEX_KEY, index));
}

// ── a user's searches ───────────────────────────────────────────────────────
// A search: { id, kind: 'search' | 'url' | 'import', query (the keyword, or a
//   label for links / an import), urls (kind 'url'), platforms, fromPage, toPage,
//   trackIds, createdAt, coinsCharged }
export async function readUserSearches(userId) {
  const doc = await readBlobJson(userKey(userId), null);
  return Array.isArray(doc?.searches) ? doc.searches : [];
}

export async function updateUserSearches(userId, update) {
  return withLock(userKey(userId), async () => {
    const next = update(await readUserSearches(userId));
    await writeBlobJson(userKey(userId), { userId: String(userId), searches: next });
    return next;
  });
}

// A user with no searches left keeps no file (checked under the same lock,
// so a search added at the same moment isn't lost).
export async function dropUserIfEmpty(userId) {
  return withLock(userKey(userId), async () => {
    if ((await readUserSearches(userId)).length) return false;
    await deleteBlobJsonMany([userKey(userId)]);
    return true;
  });
}

// Change one track's stored data in place (under its lock, like saveRun).
// `change(track)` edits it and returns true when something changed (only
// then is it written). → the track, or null when it doesn't exist.
export async function updateTrack(id, change) {
  return withLock(trackKey(id), async () => {
    const track = await readTrack(id);
    if (!track) return null;
    if (change(track)) await writeBlobJson(trackKey(id), track);
    return track;
  });
}

// How many charged-or-free keyword searches the user has made (imports
// don't count — they're always free).
export const searchCount = (searches) => searches.filter((s) => s.kind !== 'import').length;
