import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmazon } from '../lib/scraper/platforms/amazon.js';
import { parseFlipkart } from '../lib/scraper/platforms/flipkart.js';
import { parseMeesho } from '../lib/scraper/platforms/meesho.js';
import { parseMyntra } from '../lib/scraper/platforms/myntra.js';
import { parseSnapdeal } from '../lib/scraper/platforms/snapdeal.js';
import { num, sliceJson } from '../lib/scraper/extract.js';

// Trimmed-down copies of each marketplace's search-results markup.

test('num reads marketplace number text', () => {
  assert.equal(num('₹1,299'), 1299);
  assert.equal(num('(12,345)'), 12345);
  assert.equal(num('1.2k'), 1200);
  assert.equal(num('2.5L'), 250000);
  assert.equal(num(''), null);
  assert.equal(num({ value: 499 }), 499);
});

test('sliceJson is string-aware', () => {
  const t = 'x = {"a":"}{","b":[1,{"c":2}]}; y=1';
  assert.equal(sliceJson(t, 4), '{"a":"}{","b":[1,{"c":2}]}');
});

const amazonCard = (asin, title, price, sponsored = false) => `
  <div data-component-type="s-search-result" data-asin="${asin}">
    ${sponsored ? '<span class="puis-sponsored-label-text">Sponsored</span>' : ''}
    <img class="s-image" src="https://m.media-amazon.com/${asin}.jpg">
    <h2><a class="a-link-normal" href="/Some-Title/dp/${asin}/ref=sr_1_1?x=1"><span>${title}</span></a></h2>
    <span class="a-icon-alt">4.3 out of 5 stars</span>
    <a href="/dp/${asin}#customerReviews"><span>(2,345)</span></a>
    <span class="a-price"><span class="a-offscreen">₹${price}</span></span>
    <span class="a-price a-text-price"><span class="a-offscreen">₹1,999</span></span>
  </div>`;

test('amazon: result cards, canonical /dp links, sponsored kept apart', () => {
  const html = `<html><body>${amazonCard('B0AAAAAAA1', 'Ad Earbuds', '899', true)}${amazonCard('B0AAAAAAA2', 'Wireless Earbuds Pro', '1,299')}</body></html>`;
  const out = parseAmazon(html);
  assert.equal(out.length, 2);
  assert.equal(out[0].sponsored, true);
  const p = out[1];
  assert.equal(p.id, 'B0AAAAAAA2');
  assert.equal(p.link, 'https://www.amazon.in/dp/B0AAAAAAA2');
  assert.equal(p.title, 'Wireless Earbuds Pro');
  assert.equal(p.price, 1299);
  assert.equal(p.mrp, 1999);
  assert.equal(p.rating, 4.3);
  assert.equal(p.reviews, 2345);
  assert.equal(p.sponsored, false);
});

test('amazon: brand heading + name heading are joined; "Sponsored Ad" heading marks an ad', () => {
  const card = (asin, brand, name, ad) => `<div data-component-type="s-search-result" data-asin="${asin}">
    <div data-cy="title-recipe"><div><h2><span>${brand}</span></h2></div>
    <a href="/x/dp/${asin}"><h2 aria-label="${ad ? 'Sponsored Ad - ' : ''}${name}"><span>${name}</span></h2></a></div>
    <span class="a-price"><span class="a-offscreen">₹499</span></span></div>`;
  const out = parseAmazon(`<html>${card('B0BBBBBBB1', 'Seva Chikan', 'Hand Embroidered Kurti', true)}${card('B0BBBBBBB2', 'Ada', 'Ada Chikankari Short Kurti', false)}</html>`);
  assert.equal(out[0].title, 'Seva Chikan Hand Embroidered Kurti');
  assert.equal(out[0].brand, 'Seva Chikan');
  assert.equal(out[0].sponsored, true);
  assert.equal(out[1].title, 'Ada Chikankari Short Kurti'); // brand already in the name — not doubled
  assert.equal(out[1].sponsored, false);
});

test('flipkart: app state products', () => {
  const state = {
    pageDataV4: { page: { data: { 10003: [{ widget: { data: { products: [
      { productInfo: { value: { id: 'MOBG1', titles: { title: 'Phone One' }, baseUrl: '/phone-one/p/itm111?pid=MOBG1&lid=x', pricing: { finalPrice: { value: 9999 }, mrp: { value: 12999 } }, rating: { average: 4.4, count: 5120 }, media: { images: [{ url: 'https://rukminim2.flixcart.com/image/{@width}/{@height}/a.jpg?q={@quality}' }] } } } },
      { productInfo: { value: { id: 'MOBG2', titles: { title: 'Phone Two' }, baseUrl: '/phone-two/p/itm222?pid=MOBG2', pricing: { finalPrice: { value: 7999 } }, rating: { average: 4.1, count: 80 } } } },
      { productInfo: { value: { id: 'MOBG3', titles: { title: 'Phone Three' }, baseUrl: '/phone-three/p/itm333?pid=MOBG3', pricing: { finalPrice: { value: 5999 } } } } },
    ] } } }] } } },
  };
  const html = `<html><script>window.__INITIAL_STATE__ = ${JSON.stringify(state)};</script></html>`;
  const out = parseFlipkart(html);
  assert.equal(out.length, 3);
  assert.equal(out[0].link, 'https://www.flipkart.com/phone-one/p/itm111?pid=MOBG1');
  assert.equal(out[0].price, 9999);
  assert.equal(out[0].mrp, 12999);
  assert.equal(out[0].reviews, 5120);
  assert.match(out[0].image, /416\/416/);
});

test('flipkart: falls back to product links + card text when there is no app state', () => {
  const card = (n, price) => `<div><div><a href="/kurti-${n}/p/itm00${n}?pid=KTA${n}&lid=z" title="Kurti ${n}"><img alt="Kurti ${n}" src="i${n}.jpg"></a><div>Kurti ${n}</div><div>4.2 ★ 1,024 Ratings &amp; 90 Reviews</div><div>₹${price} ₹1,499 60% off</div></div></div>`;
  const out = parseFlipkart(`<html><body>${card(1, 399)}${card(2, 449)}</body></html>`);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'KTA1');
  assert.equal(out[0].title, 'Kurti 1');
  assert.equal(out[0].price, 399);
  assert.equal(out[0].mrp, 1499);
  assert.equal(out[0].rating, 4.2);
  assert.equal(out[0].reviews, 1024);
});

test('meesho: __NEXT_DATA__ catalog objects', () => {
  const products = [1, 2, 3].map((i) => ({ product_id: `p${i}`, name: `Cotton Kurti ${i}`, slug: `cotton-kurti-${i}`, min_product_price: 300 + i, original_price: 999, image: `https://images.meesho.com/${i}.jpg`, catalog_reviews_summary: { average_rating: 3.9, rating_count: 10 * i } }));
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { initialState: { searchListing: { listing: { products } } } } } })}</script></html>`;
  const out = parseMeesho(html);
  assert.equal(out.length, 3);
  assert.equal(out[1].link, 'https://www.meesho.com/cotton-kurti-2/p/p2');
  assert.equal(out[1].price, 302);
  assert.equal(out[1].rating, 3.9);
  assert.equal(out[2].reviews, 30);
});

test('meesho rendered cards: rating and review count glued together are split', () => {
  // Real card text from a Firecrawl-rendered page: "₹174 4.02925 Reviews".
  const card = (id, name, price, rr) => `<div><a href="/${name.toLowerCase().replace(/ /g, '-')}/p/${id}"><img alt="${name}" src="${id}.jpg"></a><div><p>+4 More</p><p>${name}</p><h5>₹${price}</h5><span>${rr}</span><span>Reviews</span></div></div>`;
  const out = parseMeesho(`<html><body>${card('5x1a', 'Classic Water Bottles', 174, '4.02925')}${card('5x1b', 'Elite Water Bottles', 299, '4.023381')}</body></html>`);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'Classic Water Bottles');
  assert.equal(out[0].price, 174);
  assert.equal(out[0].rating, 4.0);
  assert.equal(out[0].reviews, 2925);
  assert.equal(out[1].reviews, 23381);
  assert.equal(out[0].link, 'https://www.meesho.com/classic-water-bottles/p/5x1a');
});

test('myntra: window.__myx search results', () => {
  const products = [1, 2, 3].map((i) => ({ productId: 100 + i, productName: `Men Shirt ${i}`, brand: 'Roadster', price: 699, mrp: 1599, rating: 4.2, ratingCount: 1200, landingPageUrl: `shirts/roadster/men-shirt/${100 + i}/buy`, searchImage: `https://assets.myntassets.com/${i}.jpg` }));
  const html = `<html><script>window.__myx = ${JSON.stringify({ searchData: { results: { products } } })}</script></html>`;
  const out = parseMyntra(html);
  assert.equal(out.length, 3);
  assert.equal(out[0].title, 'Roadster Men Shirt 1');
  assert.equal(out[0].link, 'https://www.myntra.com/shirts/roadster/men-shirt/101/buy');
  assert.equal(out[0].mrp, 1599);
});

test('snapdeal: product tuples', () => {
  const tuple = (i) => `<div class="product-tuple-listing" data-js-pog-id="66${i}"><a class="dp-widget-link" href="https://www.snapdeal.com/product/bottle-${i}/66${i}#bcrumbLabelId:1"><img class="product-image" src="b${i}.jpg"></a><p class="product-title">Steel Bottle ${i}</p><span class="product-desc-price">Rs. 599</span><span class="product-price" data-price="24${i}">Rs. 24${i}</span><div class="filled-stars" style="width:84%"></div><p class="product-rating-count">(53)</p></div>`;
  const out = parseSnapdeal(`<html>${tuple(1)}${tuple(2)}</html>`);
  assert.equal(out.length, 2);
  assert.equal(out[0].price, 241);
  assert.equal(out[0].mrp, 599);
  assert.equal(out[0].rating, 4.2);
  assert.equal(out[0].reviews, 53);
  assert.equal(out[0].link, 'https://www.snapdeal.com/product/bottle-1/661');
});

test('bought in past month — Amazon’s own number, at least this many', async () => {
  const { boughtOf } = await import('../lib/scraper/extract.js');
  assert.equal(boughtOf('Kurti ₹499 50+ bought in past month FREE delivery'), 50);
  assert.equal(boughtOf('1K+ bought in past month'), 1000);
  assert.equal(boughtOf('2.5K+ bought in past month'), 2500);
  assert.equal(boughtOf('10K+ bought in the past month'), 10000);
  assert.equal(boughtOf('4.2 out of 5 stars (1,234)'), null);
  const card = `<div data-component-type="s-search-result" data-asin="B0CCCCCCC1"><h2><span>Steel Bottle 1L</span></h2>
    <span class="a-price"><span class="a-offscreen">₹399</span></span><span class="a-size-base a-color-secondary">300+ bought in past month</span></div>`;
  assert.equal(parseAmazon(`<html>${card}</html>`)[0].bought, 300);
});
