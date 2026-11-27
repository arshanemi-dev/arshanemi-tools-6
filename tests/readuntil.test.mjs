import test from 'node:test';
import assert from 'node:assert/strict';

// Reading "until N products": runSearch goes from page 1 to the next page by
// itself until it has N. The network is faked — Snapdeal result pages with 3
// products each — and only the plain direct request is used.
process.env.JWT_SECRET = 'test-secret';
process.env.SCRAPER_ORDER = 'direct';
delete process.env.FIRECRAWL_API_KEY;
delete process.env.SCRAPEDO_TOKEN;
const { runSearch } = await import('../lib/scraper/runSearch.js');

const tuple = (id) => `<div class="product-tuple-listing" data-js-pog-id="${id}"><a class="dp-widget-link" href="https://www.snapdeal.com/product/bottle-${id}/${id}"><img class="product-image" src="b.jpg"></a><p class="product-title">Bottle ${id}</p><span class="product-price" data-price="249">Rs. 249</span></div>`;
const pageHtml = (ids) => `<html><body>${ids.map(tuple).join('')}${'<!-- padding -->'.repeat(400)}</body></html>`;

// `pages` = { 1: [ids], 2: [ids], … } → the pages asked for, in order.
function fakePages(pages) {
  const asked = [];
  globalThis.fetch = async (url) => {
    const page = Number(new URL(String(url)).searchParams.get('page') || 1);
    asked.push(page);
    return new Response(pageHtml(pages[page] || []), { status: 200 });
  };
  return asked;
}

test('reads page 1, then page 2 by itself, and stops once it has N', async () => {
  const asked = fakePages({ 1: [11, 12, 13], 2: [21, 22, 23], 3: [31, 32, 33] });
  const r = await runSearch('snapdeal', { query: 'bottle' }, { want: 5 });
  assert.deepEqual(asked, [1, 2]); // page 3 never asked for
  assert.equal(r.stoppedBy, 'target');
  assert.equal(r.pagesRead, 2);
  assert.deepEqual(r.products.map((p) => p.rank), [1, 2, 3, 4, 5]); // only the first 5
});

test('stops when the results run out before N', async () => {
  const asked = fakePages({ 1: [11, 12, 13], 2: [11, 12, 13] }); // page 2 only repeats page 1
  const r = await runSearch('snapdeal', { query: 'bottle' }, { want: 50 });
  assert.deepEqual(asked, [1, 2]);
  assert.equal(r.stoppedBy, 'ended');
  assert.equal(r.products.length, 3);
});

test('N reached on page 1 → only one page is read', async () => {
  const asked = fakePages({ 1: [11, 12, 13], 2: [21, 22, 23] });
  const r = await runSearch('snapdeal', { query: 'bottle' }, { want: 2 });
  assert.deepEqual(asked, [1]);
  assert.equal(r.stoppedBy, 'target');
  assert.equal(r.products.length, 2);
});
