import test from 'node:test';
import assert from 'node:assert/strict';

// Meesho has no real page 2 — more products load as you scroll. A read opens
// page 1 once and Firecrawl's browser scrolls it. The network is faked: a
// fake Firecrawl that hands back 20 more product cards per scroll asked for.
process.env.JWT_SECRET = 'test-secret';
process.env.FIRECRAWL_API_KEY = 'fc-test-key';
process.env.SCRAPER_ORDER = 'firecrawl';
delete process.env.SCRAPEDO_TOKEN;
const { runSearch } = await import('../lib/scraper/runSearch.js');
const { parseMeesho } = await import('../lib/scraper/platforms/meesho.js');

const card = (i) => `<div><a href="/blouse-${i}/p/m${i}x"><img alt="Blouse ${i}" src="${i}.jpg"></a><div><p>Blouse ${i}</p><h5>₹${200 + i}</h5><span>4.1${100 + i}</span><span>Reviews</span></div></div>`;
const listing = (n) => `<html><body>${Array.from({ length: n }, (_, i) => card(i + 1)).join('')}${'<!-- padding -->'.repeat(200)}</body></html>`;

// `total` = how many products the listing has in all → the requests made.
function fakeFirecrawl(total) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    const scrolls = (body.actions || []).filter((a) => a.type === 'executeJavascript').length;
    const shown = Math.min(total, 20 * (1 + scrolls));
    return new Response(JSON.stringify({ success: true, data: { rawHtml: listing(shown), metadata: { statusCode: 200 } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}

test('50 products → page 1 opened ONCE and scrolled 3 times; ranks 1–50', async () => {
  const calls = fakeFirecrawl(1000);
  const r = await runSearch('meesho', { url: 'https://www.meesho.com/blouses/pl/3l5' }, { want: 50 });
  assert.equal(calls.length, 1); // no "page 2" request
  assert.doesNotMatch(calls[0].url, /page=/);
  assert.equal(calls[0].actions.length, 6); // 3 × (scroll to the bottom + wait)
  assert.deepEqual(calls[0].actions.slice(0, 2).map((a) => a.type), ['executeJavascript', 'wait']);
  assert.equal(r.products.length, 50);
  assert.deepEqual(r.products.map((p) => p.rank), Array.from({ length: 50 }, (_, i) => i + 1));
  assert.equal(r.stoppedBy, 'target');
  assert.equal(r.scrolls, 3);
});

test('20 or fewer → no scrolling at all', async () => {
  const calls = fakeFirecrawl(1000);
  const r = await runSearch('meesho', { query: 'blouse' }, { want: 20 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].actions, undefined);
  assert.equal(r.products.length, 20);
  assert.equal(r.scrolls, 0);
});

test('the listing ends before N → what it has, "ended"', async () => {
  fakeFirecrawl(70);
  const r = await runSearch('meesho', { query: 'blouse' }, { want: 100 });
  assert.equal(r.products.length, 70);
  assert.equal(r.stoppedBy, 'ended');
});

test('more than one read can scroll → 24 scrolls (Firecrawl’s limit), "limit"', async () => {
  const calls = fakeFirecrawl(5000);
  const r = await runSearch('meesho', { query: 'blouse' }, { want: 1000 });
  assert.equal(calls[0].actions.length, 48);
  const waited = calls[0].waitFor + calls[0].actions.filter((a) => a.type === 'wait').reduce((n, a) => n + a.milliseconds, 0);
  assert.ok(waited <= 60000, `Firecrawl allows 60 s of waiting, this asks ${waited}`);
  assert.equal(r.products.length, 500);
  assert.equal(r.stoppedBy, 'limit');
});

test('the Meesho reader: the page’s own data first, then the cards loaded by scrolling', () => {
  // The page's data holds the first 3 (it is only trusted with 3 or more); the
  // page shows 5 cards — 2 more loaded by scrolling.
  const data = [1, 2, 3].map((i) => ({ product_id: `m${i}x`, name: `Blouse ${i}`, slug: `blouse-${i}`, min_product_price: 250, catalog_reviews_summary: { average_rating: 4.5, rating_count: 99 } }));
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { products: data } } })}</script><body>${[1, 2, 3, 4, 5].map(card).join('')}</body></html>`;
  const out = parseMeesho(html);
  assert.deepEqual(out.map((p) => p.id), ['m1x', 'm2x', 'm3x', 'm4x', 'm5x']); // same ids both ways — no product twice
  assert.equal(out[0].rating, 4.5); // from the page's data
  assert.equal(out[3].price, 204); // from its card
});
