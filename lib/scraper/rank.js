// Ranking a page range's products — pure (no network, no env), shared by
// lib/scraper/runSearch.js and the tests. See runSearch.js for the rules.

// Pure. `pages` = [{ page, products }] in reading order (each page's parsed
// products as shown) → { products (deduped, ranked), rankOffset, perPage }.
export function rankPages(pages, platformId, fromPage = 1) {
  const byId = new Map();
  let organic = 0;
  let perPage = 0;
  let offset = 0;
  pages.forEach(({ page, products }, i) => {
    const fresh = [];
    for (const p of products) {
      const id = String(p.id || p.link);
      if (byId.has(id) || fresh.some((f) => f.id === id)) continue;
      fresh.push({ ...p, id });
    }
    if (i === 0) {
      perPage = fresh.filter((p) => !p.sponsored).length;
      offset = Math.max(0, fromPage - 1) * perPage;
      organic = offset;
    }
    for (const p of fresh) {
      const rank = p.sponsored ? null : (organic += 1);
      byId.set(p.id, { ...p, platform: platformId, rank, page });
    }
  });
  return { products: [...byId.values()], rankOffset: offset, perPage };
}
