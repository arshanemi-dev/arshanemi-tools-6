// Deleting Product Research data — the master admin only (New Search page).
// Server-only.
//   deleteEntries  entries + their saved data (unless another entry reads
//                  the same page and range).
//   entryStats     what each entry holds, for the admin's table.
//   storageSummary / cleanUnused / trimHistory / wipeAll  — storage tools.

import { deleteBlobJsonMany, listBlobJson, readBlobJson, writeBlobJson } from '@/lib/blobStore';
import { readTrack, updateTrack } from './store';
import { readEntries, updateEntries } from './entries';
import { shiftDay, todayIST } from './time';
import { everyDaysOf } from '@/data/entrySettings';

const TRACKS = 'research/tracks/';
const USERS = 'research/users/';
const trackKey = (id) => `${TRACKS}${id}`;
const idOfTrackKey = (key) => key.slice(TRACKS.length);

// `ids` = entry ids, or 'all'. → { entries, deletedData, keptShared }.
export async function deleteEntries(ids) {
  const hit = (e) => ids === 'all' || ids.includes(e.id);
  let removed = [];
  const remaining = await updateEntries((list) => {
    removed = list.filter(hit);
    return list.filter((e) => !hit(e));
  });
  const stillUsed = new Set(remaining.map((e) => e.trackId));
  const free = [...new Set(removed.map((e) => e.trackId))].filter((id) => !stillUsed.has(id));
  // Only data that exists counts (an entry never read has none).
  const gone = (await Promise.all(free.map(async (id) => ((await readTrack(id)) ? id : null)))).filter(Boolean);
  await deleteBlobJsonMany(free.map(trackKey));
  return { entries: removed.length, deletedData: gone.length, keptShared: removed.filter((e) => stillUsed.has(e.trackId)).length };
}

// Each entry with what it holds: products, days of history, last read, the
// last read's problem (if any).
export async function entryStats(entries) {
  return Promise.all(entries.map(async (e) => {
    const t = await readTrack(e.trackId);
    const days = new Set();
    let products = 0;
    for (const p of Object.values(t?.products || {})) {
      products += 1;
      for (const d of Object.keys(p.h || {})) days.add(d);
    }
    const last = t?.runs?.[0] || null;
    // The latest read that recorded how each page went (reads from before
    // page counts existed have no pageCounts at all). Its list may be empty —
    // page 1 failed — and then that is what shows, not an older read's counts.
    const counted = t?.runs?.find((r) => Array.isArray(r.pageCounts)) || null;
    return {
      ...e, products, days: days.size, lastRead: t?.lastRunDate || null, lastError: last?.count ? null : last?.error || null,
      pageCounts: counted?.pageCounts || [], endedAt: counted?.endedAt ?? null, failedAt: counted?.failedAt ?? null,
      countedAt: counted?.at || null, countedError: counted?.error || null,
      countedRange: counted ? { fromPage: counted.fromPage, toPage: counted.toPage } : null,
    };
  }));
}

// → { entries, autoDaily, users, tracks, unusedTracks, bytes }
//   autoDaily    = entries read by themselves (Read every N days above 0);
//   users        = users with at least one entry on their list;
//   unusedTracks = saved data no entry uses any more.
export async function storageSummary() {
  const [all, entries] = await Promise.all([listBlobJson('research/'), readEntries()]);
  const used = new Set(entries.map((e) => e.trackId));
  const tracks = all.filter((b) => b.key.startsWith(TRACKS));
  let users = 0;
  for (const u of all.filter((b) => b.key.startsWith(USERS))) {
    const doc = await readBlobJson(u.key, null);
    if (doc?.myEntries?.length) users += 1;
  }
  return {
    entries: entries.length,
    autoDaily: entries.filter((e) => e.kind !== 'import' && everyDaysOf(e) > 0).length,
    users,
    tracks: tracks.length,
    unusedTracks: tracks.filter((t) => !used.has(idOfTrackKey(t.key))).length,
    bytes: all.reduce((n, b) => n + (b.size || 0), 0),
  };
}

// Delete saved data no entry uses, the old daily-read list, and the old
// per-user search lists (already turned into entries; a user's saved entries
// and paid plans are kept). → { deletedTracks, freedBytes }
export async function cleanUnused() {
  const entries = await readEntries(); // converts old searches first, if not done yet
  const used = new Set(entries.map((e) => e.trackId));
  const all = await listBlobJson('research/');
  const unused = all.filter((b) => b.key.startsWith(TRACKS) && !used.has(idOfTrackKey(b.key)));
  const legacy = all.filter((b) => b.key === 'research/track-index');
  await deleteBlobJsonMany([...unused, ...legacy].map((b) => b.key));
  for (const u of all.filter((b) => b.key.startsWith(USERS))) {
    const doc = await readBlobJson(u.key, null);
    if (!doc?.searches) continue;
    // Only the old search list goes — saved entries and their paid plans
    // (and any old unlocks) are kept.
    const { searches, ...rest } = doc; // `searches` is dropped on purpose
    if (rest.unlocked?.length || rest.myEntries?.length || Object.keys(rest.plans || {}).length) await writeBlobJson(u.key, rest);
    else await deleteBlobJsonMany([u.key]);
  }
  return { deletedTracks: unused.length, freedBytes: unused.reduce((n, t) => n + (t.size || 0), 0) };
}

// Delete every daily snapshot older than `days` days, in every track; a
// product left with no snapshot at all goes too. → { tracks, snapshots, products }
export async function trimHistory(days) {
  const cutoff = shiftDay(todayIST(), -days);
  const result = { tracks: 0, snapshots: 0, products: 0 };
  for (const { key } of await listBlobJson(TRACKS)) {
    await updateTrack(idOfTrackKey(key), (track) => {
      let changed = false;
      for (const [pk, p] of Object.entries(track.products || {})) {
        const old = Object.keys(p.h || {}).filter((d) => d < cutoff);
        if (!old.length) continue;
        for (const d of old) delete p.h[d];
        result.snapshots += old.length;
        changed = true;
        const left = Object.keys(p.h).sort();
        if (!left.length) { delete track.products[pk]; result.products += 1; }
        else p.firstSeen = left[0]; // its history now starts later
      }
      if (changed) result.tracks += 1;
      return changed;
    });
  }
  return result;
}

// Everything Product Research has stored — every entry, every saved product
// and its history, every user's unlocks. Accounts and coins are the admin
// panel's and are not touched. → { deleted, bytes }
export async function wipeAll() {
  const all = await listBlobJson('research/');
  await deleteBlobJsonMany(all.map((b) => b.key));
  // An empty list, not a missing one — or the next read would bring the old
  // searches back as entries.
  await writeBlobJson('research/entries', []);
  return { deleted: all.length, bytes: all.reduce((n, b) => n + (b.size || 0), 0) };
}
