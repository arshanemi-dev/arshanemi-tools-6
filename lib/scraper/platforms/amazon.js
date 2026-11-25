// Amazon.in search results. Each result is a
// <div data-component-type="s-search-result" data-asin="…"> — the ASIN is the
// product's stable id and its link is canonicalised to /dp/<ASIN>, so the same
// product is the same row every day whatever tracking params Amazon adds.
import { parse } from 'node-html-parser';
import { boughtIn, clean, firstNonEmpty, fromJsonLd, fromLinkCards, num, rating5, withBrand } from '../extract';

const BASE = 'https://www.amazon.in';
const ASIN_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/;
const dpLink = (asin) => `${BASE}/dp/${asin}`;

function fromResultCards(html) {
  const root = parse(html);
  const out = [];
  for (const card of root.querySelectorAll('div[data-component-type="s-search-result"]')) {
    const asin = card.getAttribute('data-asin');
    if (!asin) continue;
    // Fashion results carry two headings — the brand ("Seva Chikan"), then
    // the product name; others one. An ad's name heading is labelled
    // "Sponsored Ad - …".
    const heads = card.querySelectorAll('h2');
    const texts = heads.map((h) => clean(h.text)).filter(Boolean);
    const brandLine = texts.length > 1 ? texts[0] : '';
    const name = texts.length ? texts[texts.length - 1] : clean(card.querySelector('[data-cy="title-recipe"]')?.text);
    const title = clean(withBrand(brandLine, name));
    if (!title) continue;
    const adHeading = heads.some((h) => /^Sponsored/i.test(h.getAttribute('aria-label') || ''));
    const prices = card.querySelectorAll('.a-price .a-offscreen').map((e) => num(e.text)).filter((n) => n != null);
    const mrpEl = card.querySelector('.a-price.a-text-price .a-offscreen');
    const ratingText = card.querySelector('.a-icon-alt')?.text
      || card.querySelector('[aria-label*="out of 5 stars"]')?.getAttribute('aria-label') || '';
    // "(12,345)" / "12,345" / "12K" — the link to the reviews holds the count.
    const reviewsLabel = card.querySelectorAll('[aria-label]').map((e) => e.getAttribute('aria-label')).find((l) => /^[\d,.]+[KkLl]?\s+(ratings?|reviews?)$/i.test(l || ''));
    const reviewsEl = card.querySelector('a[href*="customerReviews"] span')
      || card.querySelector('[data-csa-c-content-id*="ratings-count"]')
      || card.querySelector('span.a-size-base.s-underline-text');
    const sponsored = adHeading || !!card.querySelector('.puis-sponsored-label-text, .s-sponsored-label-info-icon')
      || /^Sponsored/i.test(clean(card.text).slice(0, 30));
    out.push({
      id: asin,
      title,
      link: dpLink(asin),
      image: card.querySelector('img.s-image')?.getAttribute('src') || '',
      price: prices.length ? prices[0] : null,
      mrp: mrpEl ? num(mrpEl.text) : null,
      rating: rating5(ratingText.split(' ')[0]),
      reviews: reviewsLabel ? num(reviewsLabel.split(' ')[0]) : reviewsEl ? num(reviewsEl.text.replace(/[()]/g, '')) : null,
      bought: boughtIn(card), // "1K+ bought in past month"
      brand: brandLine || clean(card.querySelector('.s-line-clamp-1 .a-size-base-plus')?.text),
      sponsored,
    });
  }
  return out;
}

export function parseAmazon(html) {
  return firstNonEmpty(
    () => fromResultCards(html),
    () => fromJsonLd(html, BASE),
    () => fromLinkCards(html, BASE, {
      isProductHref: (h) => ASIN_RE.test(h || ''),
      idOf: (u) => ASIN_RE.exec(u)?.[1],
    }).map((p) => ({ ...p, link: dpLink(p.id) })),
  );
}
