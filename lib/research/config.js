// Product Research settings the master admin sets once for everything.
// Server-only.
//
//   research/categories  ["cotton kurti", …]    — the category list the
//                        admin picks from (new ones are typed in + Enter).
//
// (There was also one shared page range here, research/config — gone: every
// entry now reads from page 1 until it has its own Products to Read.)

import { readBlobJson, writeBlobJson } from '@/lib/blobStore';
import { readEntries } from './entries';

const CATEGORIES_KEY = 'research/categories';

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
