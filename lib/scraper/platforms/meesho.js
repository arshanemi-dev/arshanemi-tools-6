// Meesho search results — a Next.js page: the products are in __NEXT_DATA__
// (objects with name / min_product_price / catalog_reviews_summary / slug /
// product_id). Product id = the catalog's product id; link /<slug>/p/<id>.
import { absUrl, clean, firstNonEmpty, fromEmbeddedJson, fromJsonLd, fromLinkCards, num, rating5 } from '../extract';

const BASE = 'https://www.meesho.com';
const PRODUCT_RE = /\/p\/[a-z0-9]+/i;

function pick(o) {
  const title = o.name || o.product_name || o.hero_product_name;
  const price = o.min_product_price ?? o.min_catalog_price ?? o.transient_price ?? o.price;
  const pid = o.product_id || o.productId || o.id;
  if (!title || typeof title !== 'string' || price == null || !pid) return null;
  if (typeof price === 'object' && price.value == null) return null;
  const href = o.slug ? `/${o.slug}/p/${pid}` : o.url || o.product_url;
  if (!href) return null;
  const reviews = o.catalog_reviews_summary || o.review_summary?.data || o.supplier_reviews_summary || {};
  return {
    id: String(pid),
    title: clean(title),
    link: absUrl(href, BASE),
    image: o.image || o.images?.[0] || o.product_images?.[0]?.url || '',
    price: num(price),
    mrp: num(o.original_price ?? o.mrp_details?.mrp ?? o.mrp),
    rating: rating5(reviews.average_rating ?? reviews.averageRating ?? o.rating),
    reviews: num(reviews.rating_count ?? reviews.review_count ?? reviews.ratingCount),
    brand: clean(o.supplier_name || ''),
    sponsored: !!(o.is_ad || o.ad_id),
  };
}

export function parseMeesho(html) {
  return firstNonEmpty(
    () => fromEmbeddedJson(html, pick),
    () => fromLinkCards(html, BASE, {
      isProductHref: (h) => PRODUCT_RE.test(h || ''),
      idOf: (u) => PRODUCT_RE.exec(u)?.[0],
    }),
    () => fromJsonLd(html, BASE),
  );
}
