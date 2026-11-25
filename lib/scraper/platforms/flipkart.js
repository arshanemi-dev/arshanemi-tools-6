// Flipkart search results. Its class names are generated and change often,
// so nothing here leans on them: first the app state it ships
// (window.__INITIAL_STATE__ — products carry productInfo-style objects with
// titles / pricing / rating / baseUrl), then every "/p/itm…?pid=…" link and
// the card text around it. A product's id is its `pid` (FSN); the link is
// canonicalised to /<slug>/p/<itm>?pid=<FSN>.
import { absUrl, clean, firstNonEmpty, fromEmbeddedJson, fromJsonLd, fromLinkCards, num, rating5, withBrand } from '../extract';

const BASE = 'https://www.flipkart.com';
const PRODUCT_RE = /\/p\/itm[a-z0-9]+/i;

function canonical(url) {
  try {
    const u = new URL(url, BASE);
    const pid = u.searchParams.get('pid');
    const path = u.pathname.match(/^\/[^?]*\/p\/itm[a-z0-9]+/i)?.[0] || u.pathname;
    return { id: pid || path, link: `${BASE}${path}${pid ? `?pid=${pid}` : ''}` };
  } catch {
    return { id: url, link: url };
  }
}

// pricing.prices[] (current layout): the struck-off entry is the MRP, the
// lowest other one is what it sells for. Older layout: finalPrice / mrp.
function prices(pricing = {}) {
  const list = Array.isArray(pricing.prices) ? pricing.prices : [];
  const sell = list.filter((x) => !x.strikeOff).map((x) => num(x.value ?? x.decimalValue)).filter((n) => n != null);
  const mrp = list.filter((x) => x.strikeOff).map((x) => num(x.value ?? x.decimalValue)).filter((n) => n != null);
  return {
    price: sell.length ? Math.min(...sell) : num(pricing.finalPrice ?? pricing.price),
    mrp: mrp.length ? Math.max(...mrp) : num(pricing.mrp),
  };
}

const imageUrl = (u) => (u ? String(u).replace('{@width}', '416').replace('{@height}', '416').replace('{@quality}', '70') : '');

// One app-state object → a product, or null.
function pick(o) {
  const title = o.titles?.title || (typeof o.title === 'string' && o.pricing ? o.title : null);
  const href = o.smartUrl || o.baseUrl || o.url;
  if (!title || !href || !PRODUCT_RE.test(href) || !o.pricing) return null;
  const { id, link } = canonical(absUrl(href, BASE));
  return {
    id: o.id || id,
    title: clean(withBrand(o.titles?.superTitle, title)),
    link,
    image: imageUrl(o.media?.images?.[0]?.url),
    ...prices(o.pricing),
    rating: rating5(o.rating?.average ?? o.averageRating),
    reviews: num(o.rating?.count ?? o.rating?.reviewCount ?? o.ratingCount),
    brand: clean(o.productBrand || o.titles?.superTitle),
    sponsored: !!(o.isAd || o.adInfo || o.tracking?.isAd),
  };
}

const cardsOf = (html) => fromLinkCards(html, BASE, {
  isProductHref: (h) => PRODUCT_RE.test(h || ''),
  idOf: (u) => canonical(u).id,
}).map((p) => ({ ...p, link: canonical(p.link).link }));

// App state first (exact ids + prices), then the rendered cards fill in what
// it leaves out (a fashion listing's state carries no ratings; its cards
// show them when Flipkart does).
export function parseFlipkart(html) {
  let state = [];
  try { state = fromEmbeddedJson(html, pick); } catch { state = []; }
  let cards = [];
  try { cards = cardsOf(html); } catch { cards = []; }
  if (state.length) {
    const byId = new Map(cards.map((c) => [c.id, c]));
    return state.map((p) => {
      const c = byId.get(canonical(p.link).id) || byId.get(p.id);
      if (!c) return p;
      return { ...p, price: p.price ?? c.price, mrp: p.mrp ?? c.mrp, rating: p.rating ?? c.rating, reviews: p.reviews ?? c.reviews, image: p.image || c.image, sponsored: p.sponsored || c.sponsored };
    });
  }
  return firstNonEmpty(() => cards, () => fromJsonLd(html, BASE));
}
