// Myntra listing pages ship `window.__myx = {...}` with
// searchData.results.products[]: productId, productName, brand, price, mrp,
// rating, ratingCount, landingPageUrl, searchImage.
import { absUrl, clean, firstNonEmpty, fromEmbeddedJson, fromJsonLd, num, rating5, withBrand } from '../extract';

const BASE = 'https://www.myntra.com';

function pick(o) {
  if (!o.productId || !(o.productName || o.product) || o.price == null) return null;
  return {
    id: String(o.productId),
    title: clean(withBrand(o.brand, o.productName || o.product)),
    link: absUrl(o.landingPageUrl || `/${o.productId}`, `${BASE}/`),
    image: o.searchImage || o.images?.[0]?.src || '',
    price: num(o.price),
    mrp: num(o.mrp),
    rating: rating5(o.rating),
    reviews: num(o.ratingCount),
    brand: clean(o.brand),
    sponsored: !!o.isAd,
  };
}

export function parseMyntra(html) {
  return firstNonEmpty(
    () => fromEmbeddedJson(html, pick),
    () => fromJsonLd(html, BASE),
  );
}
