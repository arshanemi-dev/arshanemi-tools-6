// Product Research settings the master admin sets once for everything.
// Server-only.
//
//   research/config      { fromPage, toPage }   — the ONE page range every
//                        entry is read with (Search and the daily read).
//   research/categories  ["cotton kurti", …]    — the category list the
//                        admin picks from (new ones are typed in + Enter).
//
// An entry remembers the range it was last read with (its fromPage / toPage /
// trackId). When the shared range changes, the next read moves the entry to
// a track for the new range (alignEntries) — a new history, because rank 5
// on page 1 isn't comparable with rank 5 on page 3. Going back to an old
// range brings its old history back (that track was never deleted).

import { readBlobJson, writeBlobJson } from '@/lib/blobStore';
import { DEFAULT_RANGE, pageRange, rangeProblem } from '@/data/marketplaces';
import { entryTrackId, readEntries, updateEntries } from './entries';

const CONFIG_KEY = 'research/config';
const CATEGORIES_KEY = 'research/categories';

export async function readRange() {
  const c = await readBlobJson(CONFIG_KEY, null);
  const r = c ? pageRange(c) : DEFAULT_RANGE;
  return rangeProblem(r) ? DEFAULT_RANGE : r;
}

// → { range } or { error }
export async function saveRange(input) {
  const range = pageRange(input);
  const problem = rangeProblem(range);
  if (problem) return { error: problem };
  await writeBlobJson(CONFIG_KEY, range);
  return { range };
}

// Move these entries onto the shared range (only the ones that differ).
// → the entries as they are now.
export async function alignEntries(ids, range) {
  const list = await updateEntries((all) => all.map((e) => {
    if (!ids.includes(e.id) || e.kind === 'import') return e;
    if (e.fromPage === range.fromPage && e.toPage === range.toPage) return e;
    const moved = { ...e, ...range };
    return { ...moved, trackId: entryTrackId(moved) };
  }));
  return list.filter((e) => ids.includes(e.id));
}

// ── categories ──────────────────────────────────────────────────────────────
const tidy = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

// The list; the first read starts it from the categories entries already use.
export async function readCategories() {
  const list = await readBlobJson(CATEGORIES_KEY, null);
  if (Array.isArray(list)) return list;
  const fromEntries = [];
  for (const e of await readEntries()) {
    const c = tidy(e.category);
    if (e.kind !== 'import' && c && !fromEntries.some((x) => same(x, c))) fromEntries.push(c);
  }
  fromEntries.sort((a, b) => a.localeCompare(b));
  await writeBlobJson(CATEGORIES_KEY, fromEntries);
  return fromEntries;
}

// → { category, categories } (an existing one in any letter case is reused)
//   or { error }
export async function addCategory(name) {
  const c = tidy(name);
  if (c.length < 2 || c.length > 60) return { error: 'A category is 2–60 characters' };
  const list = await readCategories();
  const found = list.find((x) => same(x, c));
  if (found) return { category: found, categories: list };
  const next = [...list, c].sort((a, b) => a.localeCompare(b));
  await writeBlobJson(CATEGORIES_KEY, next);
  return { category: c, categories: next };
}
