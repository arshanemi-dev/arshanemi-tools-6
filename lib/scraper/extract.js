// Marketplace-agnostic product extraction from a search-results page. Every
// platform parser (lib/scraper/platforms/*) tries its own precise reading
// first and falls back to these, in order:
//
//  1. embeddedJson  — the app state a page ships for hydration
//     (__NEXT_DATA__, window.__INITIAL_STATE__, window.__myx, …), walked
//     depth-first so products come out in the order they're shown, each
//     object offered to the platform's `pick(obj)`.
//  2. jsonLd        — schema.org ItemList / Product blocks.
//  3. linkCards     — every product link on the page + the text of the card
//     around it (₹ prices, "4.2 ★", "(1,234)"): survives class-name changes.
//
// A product here: { id, title, link, image, price, mrp, rating, reviews,
// brand, sponsored }. Numbers are numbers or null — never 0 for "unknown".
import { parse } from 'node-html-parser';

// ── numbers ─────────────────────────────────────────────────────────────────
export function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'object') return num(v.value ?? v.amount ?? v.price ?? v.decimalValue ?? null);
  let s = String(v).replace(/[₹,\s]|Rs\.?|INR/gi, '');
  const k = /^([\d.]+)k$/i.exec(s);
  if (k) return Math.round(Number(k[1]) * 1000);
  const l = /^([\d.]+)(?:l|lakh)$/i.exec(s);
  if (l) return Math.round(Number(l[1]) * 100000);
  s = (s.match(/-?\d+(?:\.\d+)?/) || [])[0];
  const n = s == null ? NaN : Number(s);
  return Number.isFinite(n) ? n : null;
}

export const rating5 = (v) => {
  const n = num(v);
  return n != null && n > 0 && n <= 5 ? Math.round(n * 10) / 10 : null;
};

// "1K+ bought in past month" (Amazon's own number) → 1000 — at least this
// many people bought it in the last month; null when the card doesn't say.
// No other marketplace shows a buy count on its listing pages.
// The number must stand on its own: in "₹399300+ bought" (a price and the
// count glued together by the page's markup) nothing is read — a wrong
// number is worse than none.
export function boughtOf(text) {
  const m = /(?:^|[^\d.,₹])(\d[\d,.]*\s*[KkLl]?)\+?\s*(?:people\s+)?bought\s+in\s+(?:the\s+)?(?:past|last)\s+month/i.exec(String(text || ''));
  return m ? num(m[1].replace(/\s+/g, '')) : null;
}

// The element that says it (Amazon: one <span>), so neighbouring text can't
// glue onto the number; falls back to the whole card's text.
export function boughtIn(card) {
  const own = card.querySelectorAll('span').map((e) => e.text).find((t) => /bought\s+in\s+(?:the\s+)?(?:past|last)\s+month/i.test(t) && t.length < 60);
  return boughtOf(own ?? card.text);
}

export const clean = (s) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim());

// "BRAND" + "BRAND Women Kurta" → "BRAND Women Kurta" (never the brand twice).
export const withBrand = (brand, title) => (!brand || String(title).toLowerCase().startsWith(String(brand).toLowerCase()) ? title : `${brand} ${title}`);

export function absUrl(href, base) {
  if (!href) return '';
  try {
    return new URL(String(href).replace(/&amp;/g, '&'), base).toString();
  } catch {
    return '';
  }
}

// ── embedded JSON ───────────────────────────────────────────────────────────
// The JSON object/array starting at text[start] ('{' or '['), string-aware.
export function sliceJson(text, start) {
  if (text[start] !== '{' && text[start] !== '[') return null;
  let depth = 0;
  let inStr = false;
  let quote = '';
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i += 1;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; quote = c; continue; }
    if (c === '{' || c === '[') depth += 1;
    else if (c === '}' || c === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// Every JSON blob the page embeds → parsed values (bad ones skipped).
export function embeddedJsonBlobs(html) {
  const out = [];
  const root = parse(html, { blockTextElements: { script: true, style: false } });
  for (const s of root.querySelectorAll('script')) {
    const type = (s.getAttribute('type') || '').toLowerCase();
    const text = s.rawText || '';
    if (text.length < 50 || type === 'application/ld+json') continue;
    if (type === 'application/json' || s.id === '__NEXT_DATA__') {
      try { out.push(JSON.parse(text)); } catch { /* not JSON */ }
      continue;
    }
    // window.__X__ = {...};  /  window["x"] = {...}
    const re = /(?:window\.|window\[["'])?[\w$]+["']?\]?\s*=\s*(?=[{[])/g;
    let m;
    let tries = 0;
    while ((m = re.exec(text)) && tries < 6) {
      tries += 1;
      const start = m.index + m[0].length;
      const json = sliceJson(text, start);
      if (!json || json.length < 200) continue;
      try { out.push(JSON.parse(json)); } catch { /* JS, not JSON */ }
      re.lastIndex = start + json.length;
    }
  }
  return out;
}

// Depth-first walk of `value`, offering every plain object to `pick`. A
// picked product's own subtree is not walked again (its variants are not
// separate listings). Stops after `limit` products.
export function walkProducts(value, pick, limit = 2000) {
  const out = [];
  const seen = new Set();
  const stack = [value];
  // Iterative DFS that keeps document order: push children reversed.
  while (stack.length && out.length < limit) {
    const v = stack.pop();
    if (!v || typeof v !== 'object' || seen.has(v)) continue;
    seen.add(v);
    if (!Array.isArray(v)) {
      const p = pick(v);
      if (p && p.title && p.link) { out.push(p); continue; }
    }
    const kids = Array.isArray(v) ? v : Object.values(v);
    for (let i = kids.length - 1; i >= 0; i -= 1) {
      if (kids[i] && typeof kids[i] === 'object') stack.push(kids[i]);
    }
  }
  return out;
}

export function fromEmbeddedJson(html, pick) {
  for (const blob of embeddedJsonBlobs(html)) {
    const found = walkProducts(blob, pick);
    if (found.length >= 3) return found;
  }
  return [];
}

// ── JSON-LD ─────────────────────────────────────────────────────────────────
export function fromJsonLd(html, base) {
  const out = [];
  const root = parse(html);
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try { data = JSON.parse(s.rawText); } catch { continue; }
    const items = [];
    const visit = (d) => {
      if (!d || typeof d !== 'object') return;
      if (Array.isArray(d)) return d.forEach(visit);
      if (d['@graph']) visit(d['@graph']);
      if (d['@type'] === 'ItemList' && Array.isArray(d.itemListElement)) {
        d.itemListElement.forEach((e) => items.push(e.item || e));
      } else if (d['@type'] === 'Product') items.push(d);
    };
    visit(data);
    for (const p of items) {
      const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers;
      const link = absUrl(p.url || offer?.url, base);
      if (!p.name || !link) continue;
      out.push({
        id: p.sku || p.productID || link,
        title: clean(p.name),
        link,
        image: Array.isArray(p.image) ? p.image[0] : p.image || '',
        price: num(offer?.price ?? offer?.lowPrice),
        mrp: null,
        rating: rating5(p.aggregateRating?.ratingValue),
        reviews: num(p.aggregateRating?.reviewCount ?? p.aggregateRating?.ratingCount),
        brand: clean(p.brand?.name || p.brand),
        sponsored: false,
      });
    }
  }
  return out;
}

// ── product-link cards ──────────────────────────────────────────────────────
// `isProductHref(href)` → true for a product page link; `idOf(url)` → its
// stable id. The card = the nearest ancestor (≤ 6 up) whose text has a ₹.
export function fromLinkCards(html, base, { isProductHref, idOf = (u) => u }) {
  const root = parse(html);
  const byId = new Map();
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (!isProductHref(href)) continue;
    const link = absUrl(href, base);
    const id = idOf(link);
    if (!id || byId.has(id)) {
      // The same product's second link (its image vs its title) may carry the title.
      const prev = byId.get(id);
      if (prev && !prev.title) prev.title = clean(a.getAttribute('title') || a.text);
      continue;
    }
    let card = a;
    for (let i = 0; i < 6 && card.parentNode; i += 1) {
      if (/₹\s?[\d,]+/.test(card.text) && card.text.length > 20) break;
      card = card.parentNode;
    }
    const text = clean(card.structuredText || card.text);
    const prices = [...text.matchAll(/₹\s?([\d,]+(?:\.\d+)?)/g)].map((m) => num(m[1])).filter((n) => n != null);
    const img = card.querySelector('img');
    const title = clean(a.getAttribute('title') || img?.getAttribute('alt') || a.text);
    // Meesho glues them together: "4.02925 Reviews" = rating 4.0, 2,925 reviews.
    const glued = /(?:^|\s)([1-5]\.\d)(\d[\d,]*)\s*(?:ratings?|reviews?)\b/i.exec(text);
    const ratingM = glued || /(?:^|\s)([1-5](?:\.\d)?)\s*(?:★|out of 5|\(|\s[\d,.]+[kKlL]?\s*(?:ratings?|reviews?)\b)/i.exec(text);
    const reviewsM = glued ? [null, glued[2]] : /([\d,.]+[kKlL]?)\s*(?:ratings?|reviews?)\b/i.exec(text) || /\(([\d,.]+[kKlL]?)\)/.exec(text);
    byId.set(id, {
      id,
      title,
      link,
      image: img?.getAttribute('src') || img?.getAttribute('data-src') || '',
      price: prices.length ? Math.min(...prices) : null,
      mrp: prices.length > 1 ? Math.max(...prices) : null,
      rating: ratingM ? rating5(ratingM[1]) : null,
      reviews: reviewsM ? num(reviewsM[1]) : null,
      bought: boughtOf(text),
      brand: '',
      sponsored: /\b(Sponsored|Ad)\b/.test(text.slice(0, 40)),
    });
  }
  return [...byId.values()].filter((p) => p.title && p.title.length > 3);
}

// The first strategy that finds products wins.
export function firstNonEmpty(...attempts) {
  for (const attempt of attempts) {
    let found = [];
    try { found = attempt() || []; } catch { found = []; }
    if (found.length) return found;
  }
  return [];
}
