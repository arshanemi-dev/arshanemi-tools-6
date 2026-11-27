// Ranking the pages a read gave — pure (no network, no env), shared by
// lib/scraper/runSearch.js and the tests. See runSearch.js for the rules.

// One page's products, counted against the ones earlier pages already gave
// (`seen` = a Set of product ids — the new ones are added to it).
// → { shown (listed on the page, ads too), added (new — not on an earlier
// page, nor twice on this one), ads, organic (the new ones that aren't ads) }.
export function countPage(products, seen) {
  let added = 0;
  let organic = 0;
  for (const p of products) {
    const id = String(p.id || p.link);
    if (seen.has(id)) continue;
    seen.add(id);
    added += 1;
    if (!p.sponsored) organic += 1;
  }
  return { shown: products.length, added, ads: products.filter((p) => p.sponsored).length, organic };
}

// Pure. `pages` = [{ page, products }] in reading order (each page's parsed
// products as shown) → { products (deduped, ranked), rankOffset, perPage }.
// `want` = keep only the first N ranked products (ads shown among them are
// kept too, without a rank); null = keep all.
export function rankPages(pages, platformId, fromPage = 1, want = null) {
  const byId = new Map();
  const seen = new Set();
  let organic = 0;
  let perPage = 0;
  let offset = 0;
  let full = false;
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
    for (const p of fresh) {
      if (full) return;
      const rank = p.sponsored ? null : (organic += 1);
      byId.set(p.id, { ...p, platform: platformId, rank, page });
      if (want && rank != null && rank - offset >= want) full = true;
    }
  });
  return { products: [...byId.values()], rankOffset: offset, perPage };
}
