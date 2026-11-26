// Deleting Product Research data (Settings page). Server-only.
//
// For a user — deleteSearches: their searches leave their list. Their
// imported sheets' data is deleted (only they had it). A shared track (a
// keyword / link others may track too) is released: when nobody tracks it
// any more it stops being read every day and its data is deleted; while
// someone else still does, it stays for them.
//
// For the master admin — storageSummary, cleanUnused, trimHistory, wipeAll.

import { deleteBlobJsonMany, listBlobJson, readBlobJson } from '@/lib/blobStore';
import { dropUserIfEmpty, readIndex, readTrack, releaseTracks, trackKeyOf, updateTrack, updateUserSearches, writeIndex } from './store';
import { shiftDay, todayIST } from './time';

const TRACKS = 'research/tracks/';
const USERS = 'research/users/';
const idOfTrackKey = (key) => key.slice(TRACKS.length);

// ── a user's own data ───────────────────────────────────────────────────────
// `ids` = search ids, or 'all'. → { searches, deletedData, keptShared }:
// how many searches went, how many tracks' data was deleted with them, and
// how many shared tracks stay because someone else still tracks them.
export async function deleteSearches(userId, ids) {
  const hit = (s) => ids === 'all' || ids.includes(s.id);
  let removed = [];
  const remaining = await updateUserSearches(userId, (list) => {
    removed = list.filter(hit);
    return list.filter((s) => !hit(s));
  });
  // A track another of this user's searches still uses is left alone.
  const stillUsed = new Set(remaining.flatMap((s) => s.trackIds || []));
  const free = (list) => [...new Set(list.flatMap((s) => s.trackIds || []))].filter((id) => !stillUsed.has(id));
  const imports = free(removed.filter((s) => s.kind === 'import'));
  const shared = free(removed.filter((s) => s.kind !== 'import'));
  await deleteBlobJsonMany(imports.map(trackKeyOf));
  await backfillOwners(shared);
  const { stopped } = await releaseTracks(userId, shared);
  if (!remaining.length) await dropUserIfEmpty(userId);
  return { searches: removed.length, deletedData: imports.length + stopped.length, keptShared: shared.length - stopped.length };
}

// Each of the user's searches with what it holds: products, days of
// history, last read — for the Settings list.
export async function searchesWithStats(searches) {
  return Promise.all(searches.map(async (s) => {
    const tracks = (await Promise.all((s.trackIds || []).map(readTrack))).filter(Boolean);
    const days = new Set();
    let products = 0;
    for (const t of tracks) {
      for (const p of Object.values(t.products || {})) {
        products += 1;
        for (const d of Object.keys(p.h || {})) days.add(d);
      }
    }
    const lastRead = tracks.map((t) => t.lastRunDate).filter(Boolean).sort().pop() || null;
    return { ...s, products, days: days.size, lastRead };
  }));
}

// ── master admin ────────────────────────────────────────────────────────────
// Who uses which track, from every user's list → Map(trackId → Set(userId)).
// The map also carries `active` (users with at least one search) and
// `emptyKeys` (user files with none left).
async function trackUsers() {
  const used = new Map();
  used.active = 0;
  used.emptyKeys = [];
  for (const { key } of await listBlobJson(USERS)) {
    const doc = await readBlobJson(key, null);
    const userId = doc?.userId || key.slice(USERS.length);
    if (doc?.searches?.length) used.active += 1;
    else used.emptyKeys.push(key);
    for (const s of doc?.searches || []) {
      for (const id of s.trackIds || []) {
        if (!used.has(id)) used.set(id, new Set());
        used.get(id).add(String(userId));
      }
    }
  }
  return used;
}

// Daily-read entries made before owners were recorded have no `owners` —
// work them out from every user's list (only when one of `ids` lacks them),
// so releasing them decides correctly instead of keeping them for nobody.
async function backfillOwners(ids) {
  const index = await readIndex();
  const lacking = (e) => ids.includes(e.id) && !Array.isArray(e.owners);
  if (!index.some(lacking)) return;
  const used = await trackUsers();
  await writeIndex(index.map((e) => (lacking(e) ? { ...e, owners: [...(used.get(e.id) || [])] } : e)));
}

// → { users, tracks, dailyReads, unusedTracks, unusedReads, bytes }
//   unusedTracks = stored data no user's search uses any more;
//   unusedReads  = daily reads (credits spent every day) for nobody.
export async function storageSummary() {
  const [all, index, used] = await Promise.all([listBlobJson('research/'), readIndex(), trackUsers()]);
  const tracks = all.filter((b) => b.key.startsWith(TRACKS));
  return {
    users: used.active,
    tracks: tracks.length,
    dailyReads: index.length,
    unusedTracks: tracks.filter((t) => !used.has(idOfTrackKey(t.key))).length,
    unusedReads: index.filter((e) => !used.has(e.id)).length,
    bytes: all.reduce((n, b) => n + (b.size || 0), 0),
  };
}

// Delete every track no user's search uses, and rebuild the daily-read
// list's owners from the users' lists (also for entries made before owners
// were recorded). → { deletedTracks, freedBytes, dailyReads }
export async function cleanUnused() {
  const used = await trackUsers();
  const tracks = await listBlobJson(TRACKS);
  const unused = tracks.filter((t) => !used.has(idOfTrackKey(t.key)));
  await deleteBlobJsonMany([...unused.map((t) => t.key), ...used.emptyKeys]);

  const index = await readIndex();
  const kept = index.filter((e) => used.has(e.id)).map((e) => ({ ...e, owners: [...used.get(e.id)] }));
  await writeIndex(kept);
  return { deletedTracks: unused.length, freedBytes: unused.reduce((n, t) => n + (t.size || 0), 0), dailyReads: kept.length };
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

// Everything Product Research has stored — every user's searches, every
// track and its history, the daily-read list. Accounts and coins are the
// admin panel's and are not touched. → { deleted, bytes }
export async function wipeAll() {
  const all = await listBlobJson('research/');
  await deleteBlobJsonMany(all.map((b) => b.key));
  return { deleted: all.length, bytes: all.reduce((n, b) => n + (b.size || 0), 0) };
}
