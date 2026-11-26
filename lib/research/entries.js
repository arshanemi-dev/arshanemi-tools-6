// Entries — what Product Research tracks, managed by the master admin only
// (Settings › New Search). Server-only. One shared list:
//
//   research/entries   [{ id, name, platform, category, url, kind, fromPage,
//                         toPage, trackId, autoDaily, createdAt }]
//
//  - name     "<marketplace>_<category>" (e.g. "flipkart_cotton-kurti") —
//             unique; the entry's name everywhere.
//  - url      the one listing link that is read (a category or search page of
//             that marketplace); null = the marketplace's own search results
//             for the category words.
//  - kind     'url' | 'search' (no link) | 'import' (an imported sheet).
//  - autoDaily  read again every day by the cron (off = only when the admin
//             presses Search now).
//  - trackId  where its products + daily history live (lib/research/store.js).
//
// Every signed-in user sees the list of entries; to see an entry's data a
// user adds it on My Entries and pays for it monthly (data/billing.js) —
// kept in their research/users file (`myEntries` + `plans`, below).
// Product Research's Entries ▾ lists only those. The master admin sees
// everything, free.
//
// The first read of the list converts searches users made before entries
// existed into entries (their saved data is reused — same track ids).

import { createHash } from 'node:crypto';
import { listBlobJson, readBlobJson, writeBlobJson } from '@/lib/blobStore';
import { listingLabel, marketplaceById, marketplaceOfLink, pageRange } from '@/data/marketplaces';
import { searchTrackId, urlTrackId } from './store';
import { entryName, slugify } from '@/data/entryName';

const ENTRIES_KEY = 'research/entries';
const USERS = 'research/users/';
const userKey = (userId) => `${USERS}${String(userId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

// "flipkart" + "Cotton Kurti" → "flipkart_cotton-kurti" (data/entryName.js)
export { entryName, slugify };
const newId = (seed) => createHash('sha1').update(`${seed}|${Date.now()}|${Math.random()}`).digest('hex').slice(0, 12);

// Writes to one key from this process go one at a time.
const locks = (globalThis.__entryLocks ??= new Map());
async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  let release;
  const next = new Promise((r) => { release = r; });
  locks.set(key, prev.then(() => next));
  await prev.catch(() => {});
  try { return await fn(); } finally { release(); if (locks.get(key) === next) locks.delete(key); }
}

// The track id an entry's data lives under — the same function a search
// used, so converted searches keep their history.
export function entryTrackId({ platform, category, url, fromPage, toPage }) {
  const range = { fromPage, toPage };
  return url ? urlTrackId(platform, url, range) : searchTrackId(platform, category, range);
}

// A unique name: "flipkart_kurti", then "flipkart_kurti-2", …
function uniqueName(base, taken) {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i += 1) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

// Searches made before entries existed → entries (once, when the list is
// first read). Keyword searches give one entry per marketplace; link
// searches one per link; imports one each. Same data — nothing is re-read.
async function fromOldSearches() {
  const out = [];
  const seen = new Set();
  const taken = new Set();
  for (const { key } of await listBlobJson(USERS)) {
    const doc = await readBlobJson(key, null);
    for (const s of doc?.searches || []) {
      const { fromPage, toPage } = pageRange(s);
      const add = (e) => {
        if (seen.has(e.trackId)) return;
        seen.add(e.trackId);
        const name = uniqueName(e.name, taken);
        taken.add(name);
        out.push({ id: newId(e.trackId), autoDaily: true, createdAt: s.createdAt || new Date().toISOString(), ...e, name });
      };
      if (s.kind === 'import') {
        for (const trackId of s.trackIds || []) add({ name: `import_${slugify(s.query)}`, platform: 'mixed', category: s.query, url: null, kind: 'import', fromPage: 0, toPage: 0, trackId });
      } else if (s.kind === 'url') {
        for (const url of s.urls || []) {
          const platform = marketplaceOfLink(url);
          const category = listingLabel(url).split(' · ').slice(1).join(' · ') || 'listing';
          add({ name: entryName(platform, category), platform, category, url, kind: 'url', fromPage, toPage, trackId: urlTrackId(platform, url, { fromPage, toPage }) });
        }
      } else {
        for (const platform of s.platforms || []) {
          add({ name: entryName(platform, s.query), platform, category: s.query, url: null, kind: 'search', fromPage, toPage, trackId: searchTrackId(platform, s.query, { fromPage, toPage }) });
        }
      }
    }
  }
  return out;
}

export async function readEntries() {
  const list = await readBlobJson(ENTRIES_KEY, null);
  if (Array.isArray(list)) return list;
  return withLock(ENTRIES_KEY, async () => {
    const again = await readBlobJson(ENTRIES_KEY, null);
    if (Array.isArray(again)) return again;
    const converted = await fromOldSearches();
    await writeBlobJson(ENTRIES_KEY, converted);
    return converted;
  });
}

export async function updateEntries(change) {
  return withLock(ENTRIES_KEY, async () => {
    const next = change(await readEntries());
    await writeBlobJson(ENTRIES_KEY, next);
    return next;
  });
}

// What an entry reads, whatever its page range: its link, or (no link) the
// market place's search for its category. Two entries may not read the same.
const sourceOf = (e) => (e.url ? `url:${e.url}` : `search:${e.platform}:${String(e.category || '').trim().toLowerCase().replace(/\s+/g, ' ')}`);

// Market place + category + link checked the same way for a new entry and
// an edited one. → { platform, category, url, name } or { error }.
function checkFields(input, others) {
  const market = marketplaceById(input.platform);
  if (!market) return { error: 'Pick a market place' };
  const category = String(input.category || '').trim().replace(/\s+/g, ' ');
  if (category.length < 2 || category.length > 80) return { error: 'Pick or type a category of 2–80 characters' };
  const name = entryName(market.id, category);
  if (others.some((e) => e.name === name)) return { error: `“${name}” already exists — every name must be different` };
  const url = input.url || null;
  if (url && marketplaceOfLink(url) !== market.id) return { error: `That link isn’t a ${market.name} page — paste a ${market.name} category or search page` };
  const twin = others.find((e) => sourceOf(e) === sourceOf({ platform: market.id, category, url }));
  if (twin) return { error: `“${twin.name}” already reads this same ${url ? 'link' : 'search'}` };
  return { platform: market.id, category, url, name };
}

// A new row → an entry, or { error } in plain words. input = { platform,
// category, url (cleaned by readListingUrl, or empty), autoDaily }; `range`
// = the shared page range (lib/research/config.js).
export function makeEntry(input, existing, range) {
  const f = checkFields(input, existing);
  if (f.error) return f;
  const { fromPage, toPage } = pageRange(range || input);
  const entry = {
    id: newId(f.name), name: f.name, platform: f.platform, category: f.category, url: f.url, kind: f.url ? 'url' : 'search',
    fromPage, toPage, autoDaily: input.autoDaily !== false, createdAt: new Date().toISOString(),
  };
  entry.trackId = entryTrackId(entry);
  return { entry };
}

// An edited row → the entry changed, or { error }. `changes` may hold
// platform, category, url, autoDaily. Changing what it reads (market place,
// category, link) gives it a new name and a new history (new track); the
// daily switch alone changes nothing else. → { entry, newHistory }
export function editEntry(current, changes, existing) {
  const next = { ...current, ...(typeof changes.autoDaily === 'boolean' ? { autoDaily: changes.autoDaily } : {}) };
  const touches = ['platform', 'category', 'url'].some((k) => k in changes);
  if (!touches || current.kind === 'import') return { entry: next, newHistory: false };
  const f = checkFields({ platform: changes.platform ?? current.platform, category: changes.category ?? current.category, url: 'url' in changes ? changes.url : current.url }, existing.filter((e) => e.id !== current.id));
  if (f.error) return f;
  Object.assign(next, { name: f.name, platform: f.platform, category: f.category, url: f.url, kind: f.url ? 'url' : 'search' });
  next.trackId = entryTrackId(next);
  return { entry: next, newHistory: next.trackId !== current.trackId };
}

// An entry as the page and the reading code take it — the shape the
// search-era code reads (query = its name, trackIds = [its track]).
export const entryAsSearch = (e) => ({
  ...e,
  query: e.name,
  platforms: e.platform && e.platform !== 'mixed' ? [e.platform] : [],
  urls: e.url ? [e.url] : [],
  trackIds: [e.trackId],
});

// The reading job for an entry (lib/research/service.js ensureJobs).
export const jobOfEntry = (e) => ({
  id: e.trackId, platform: e.platform, query: e.category, url: e.url, label: e.name, fromPage: e.fromPage, toPage: e.toPage,
});

// ── a user's file: saved entries + their monthly plans ──────────────────────
// research/users/<id> = { userId, myEntries: [entryId], plans: { [entryId]:
// { paidUntil, autoRenew, startedAt, months } } } (lib/research/plans.js).
// Charging and the rules are lib/research/subscriptions.js.
export async function readUserDoc(userId) {
  const doc = (await readBlobJson(userKey(userId), null)) || {};
  return {
    ...doc,
    myEntries: Array.isArray(doc.myEntries) ? doc.myEntries : [],
    plans: doc.plans && typeof doc.plans === 'object' ? doc.plans : {},
  };
}

// Change a user's file under their lock (one change at a time per user in
// this process, so two quick clicks can't both charge). `change(doc)` may be
// async → { doc (to write; null = write nothing), result } → result.
export async function updateUserDoc(userId, change) {
  return withLock(userKey(userId), async () => {
    const { doc, result } = await change(await readUserDoc(userId));
    if (doc) await writeBlobJson(userKey(userId), { ...doc, userId: String(userId) });
    return result;
  });
}
