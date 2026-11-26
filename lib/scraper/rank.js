// Ranking a page range's products — pure (no network, no env), shared by
// lib/scraper/runSearch.js and the tests. See runSearch.js for the rules.
//
// `limit` (both functions) = keep only the first N new non-ad products of
// each page (the entry's Products / Page — data/entrySettings.js); ads that
// come before the Nth are kept too. null = keep every product. Products past
// the limit are still counted for the ranks after them, so a rank is always
// the real place in the market place's results.

// One page's products, counted against the ones earlier pages already gave
// (`seen` = a Set of product ids — the new ones are added to it, kept or not).
// → { shown (listed on the page, ads too), added (new — not on an earlier
// page, nor twice on this one — and kept), ads, fresh (new, kept or not) }.
export function countPage(products, seen, limit = null) {
  let added = 0;
  let fresh = 0;
  let keptOrganic = 0;
  for (const p of products) {
    const id = String(p.id || p.link);
    if (seen.has(id)) continue;
    seen.add(id);
    fresh += 1;
    if (limit && keptOrganic >= limit) continue;
    added += 1;
    if (!p.sponsored) keptOrganic += 1;
  }
  return { shown: products.length, added, ads: products.filter((p) => p.sponsored).length, fresh };
}

// Pure. `pages` = [{ page, products }] in reading order (each page's parsed
// products as shown) → { products (deduped, ranked, within the limit),
// rankOffset, perPage (organic products the first page listed) }.
export function rankPages(pages, platformId, fromPage = 1, limit = null) {
  const byId = new Map();
  const seen = new Set();
  let organic = 0;
  let perPage = 0;
  let offset = 0;
  pages.forEach(({ page, products }, i) => {
    const fresh = [];
    for (const p of products) {
      const id = String(p.id || p.link);
      if (seen.has(id)) continue;
      seen.add(id);
      fresh.push({ ...p, id });
    }
    if (i === 0) {
      perPage = fresh.filter((p) => !p.sponsored).length;
      offset = Math.max(0, fromPage - 1) * perPage;
      organic = offset;
    }
    let kept = 0;
    for (const p of fresh) {
      const rank = p.sponsored ? null : (organic += 1);
      if (limit && kept >= limit) continue; // past the page's limit: counted for the ranks, not kept
      if (!p.sponsored) kept += 1;
      byId.set(p.id, { ...p, platform: platformId, rank, page });
    }
  });
  return { products: [...byId.values()], rankOffset: offset, perPage };
}
