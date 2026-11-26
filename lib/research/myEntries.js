// "My entries" — the entries each user saves on the My Entries page
// (/product-research/my-entries), and Product Research's Entries ▾, a
// pick-several dropdown that lists only those. Pure (the browser, the server,
// the tests).
//
// A user who saved none (or whose saved ones were all deleted) gets every
// entry in Entries ▾ — nothing is hidden.

export const MAX_PICK = 10; // entries shown together in Daily History at once

// The entries Entries ▾ lists: my saved ones (in the list's own order), else
// every entry.
export function listedEntries(all, myIds) {
  const saved = new Set(myIds || []);
  const mine = (all || []).filter((e) => saved.has(e.id));
  return mine.length ? mine : all || [];
}

// The pick to start with: the remembered ids that are still listed (at most
// MAX_PICK), else the first unlocked entry, else the first. → [id]
export function startPick(listed, remembered) {
  const ids = new Set(listed.map((e) => e.id));
  const kept = (Array.isArray(remembered) ? remembered : []).filter((id) => ids.has(id)).slice(0, MAX_PICK);
  if (kept.length) return [...new Set(kept)];
  const first = listed.find((e) => !e.locked) || listed[0];
  return first ? [first.id] : [];
}

// "flipkart_kurti" · "flipkart_kurti, amazon_kurti" · "flipkart_kurti + 3 more"
export function pickLabel(names) {
  if (names.length <= 2) return names.join(', ');
  return `${names[0]} + ${names.length - 1} more`;
}

// Several opened entries → one view, the shape one entry has
// ({ search, tracks, status }). `parts` = [{ entry, data }] in pick order;
// `id` = the pick's key. With more than one entry, each product is keyed per
// entry (the same product in two entries keeps two histories — its rank in
// one list isn't its rank in the other) and carries its entry's name.
// → null when nothing is open.
export function combineEntries(parts, id) {
  if (!parts.length) return null;
  const many = parts.length > 1;
  const names = parts.map((p) => p.entry.name);
  const tracks = parts.flatMap(({ entry, data }) => (data.tracks || []).map((t) => ({
    ...t,
    products: Object.fromEntries(Object.values(t.products || {}).map((p) => {
      const key = many ? `${entry.id}|${p.key}` : p.key;
      return [key, { ...p, key, entry: entry.name }];
    })),
  })));
  const status = parts.flatMap(({ entry, data }) => (data.status || []).map((s) => (many ? { ...s, id: `${entry.id}|${s.id}`, label: entry.name } : s)));
  const first = parts[0].data.search || {};
  return { search: { ...first, id, query: pickLabel(names), entries: names }, tracks, status };
}
