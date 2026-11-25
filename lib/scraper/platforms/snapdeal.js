// Snapdeal search results — server-rendered "product-tuple-listing" cards.
import { parse } from 'node-html-parser';
import { absUrl, clean, firstNonEmpty, fromJsonLd, fromLinkCards, num, rating5 } from '../extract';

const BASE = 'https://www.snapdeal.com';
const PRODUCT_RE = /\/product\/[^/]+\/\d+/;

function fromTuples(html) {
  const root = parse(html);
  const out = [];
  for (const card of root.querySelectorAll('.product-tuple-listing')) {
    const a = card.querySelector('a.dp-widget-link') || card.querySelector('a[href*="/product/"]');
    const link = absUrl(a?.getAttribute('href'), BASE).split('#')[0];
    const id = card.getAttribute('data-js-pog-id') || card.getAttribute('id') || PRODUCT_RE.exec(link)?.[0];
    const title = clean(card.querySelector('.product-title')?.text);
    if (!link || !title || !id) continue;
    const priceEl = card.querySelector('.product-price');
    // Stars are drawn as a filled bar: width 84% → 4.2.
    const width = /width:\s*([\d.]+)%/.exec(card.querySelector('.filled-stars')?.getAttribute('style') || '')?.[1];
    const img = card.querySelector('img.product-image');
    out.push({
      id: String(id),
      title,
      link,
      image: img?.getAttribute('src') || img?.getAttribute('data-src') || '',
      price: num(priceEl?.getAttribute('data-price') ?? priceEl?.text),
      mrp: num(card.querySelector('.product-desc-price')?.text),
      rating: width ? rating5((Number(width) / 20).toFixed(1)) : null,
      reviews: num(card.querySelector('.product-rating-count')?.text?.replace(/[()]/g, '')),
      brand: '',
      sponsored: false,
    });
  }
  return out;
}

export function parseSnapdeal(html) {
  return firstNonEmpty(
    () => fromTuples(html),
    () => fromLinkCards(html, BASE, { isProductHref: (h) => PRODUCT_RE.test(h || ''), idOf: (u) => PRODUCT_RE.exec(u)?.[0] }),
    () => fromJsonLd(html, BASE),
  );
}
