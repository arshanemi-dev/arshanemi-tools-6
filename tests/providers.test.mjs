import test from 'node:test';
import assert from 'node:assert/strict';

// Fake keys (this file runs in its own process); the network is faked too.
process.env.JWT_SECRET = 'test-secret';
process.env.FIRECRAWL_API_KEY = 'fc-test-key';
process.env.SCRAPEDO_TOKEN = 'sd-test-token';
process.env.SCRAPER_ORDER = 'firecrawl,scrapedo,custom,direct';
const { fetchPage, outOfCredits, routeFor } = await import('../lib/scraper/fetchPage.js');

const PAGE = `<html><body>${'<div class="p">product</div>'.repeat(200)}</body></html>`;
const CAPTCHA = `<html><body>Enter the characters you see below ${' '.repeat(600)}</body></html>`;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const html = (status, body) => new Response(body, { status });

// Each test scripts what each service answers; `calls` records who was asked.
function fakeNetwork(script) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const who = u.startsWith('https://api.firecrawl.dev') ? 'firecrawl' : u.startsWith('https://api.scrape.do') ? (u.includes('super=true') ? 'scrapedo+super' : 'scrapedo') : 'direct';
    calls.push({ who, url: u, body: opts.body ? JSON.parse(opts.body) : null });
    const answer = script[who];
    return typeof answer === 'function' ? answer() : answer?.clone() ?? html(500, 'no script');
  };
  return calls;
}
const resetCredits = () => { for (const k of Object.keys(globalThis.__scraperState.outUntil)) delete globalThis.__scraperState.outUntil[k]; };

test('level 1: Firecrawl delivers — always a fresh page, raw HTML, India', async () => {
  resetCredits();
  const calls = fakeNetwork({ firecrawl: () => json(200, { success: true, data: { rawHtml: PAGE, metadata: { statusCode: 200 } } }) });
  const r = await fetchPage('https://www.flipkart.com/search?q=x', { platform: 'flipkart' });
  assert.equal(r.via, 'firecrawl');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.maxAge, 0); // never a cached copy — daily ranks must be today's
  assert.deepEqual(calls[0].body.formats, ['rawHtml']);
  assert.equal(calls[0].body.location.country, 'IN');
});

test('Firecrawl out of credits (402) → Scrape.do, and Firecrawl is skipped after that', async () => {
  resetCredits();
  const calls = fakeNetwork({
    firecrawl: () => json(402, { success: false, error: 'Payment Required: Insufficient credits' }),
    scrapedo: () => html(200, PAGE),
  });
  const r1 = await fetchPage('https://www.myntra.com/kurti', { platform: 'myntra' });
  assert.equal(r1.via, 'scrapedo');
  assert.equal(outOfCredits()[0].id, 'firecrawl');
  const r2 = await fetchPage('https://www.myntra.com/kurti?p=2', { platform: 'myntra' });
  assert.equal(r2.via, 'scrapedo');
  assert.deepEqual(calls.map((c) => c.who), ['firecrawl', 'scrapedo', 'scrapedo']); // not re-asked
  assert.match(calls[1].url, /geoCode=in/);
  assert.doesNotMatch(calls[1].url, /render=true/); // no JS needed → cheaper
});

test('Scrape.do blocked on the cheap proxy → retried with residential (super), only then', async () => {
  resetCredits();
  const calls = fakeNetwork({
    firecrawl: () => json(200, { success: true, data: { rawHtml: CAPTCHA, metadata: { statusCode: 200 } } }),
    scrapedo: () => html(200, CAPTCHA),
    'scrapedo+super': () => html(200, PAGE),
  });
  const r = await fetchPage('https://www.amazon.in/s?k=x', { platform: 'amazon' });
  assert.equal(r.via, 'scrapedo+super');
  assert.deepEqual(calls.map((c) => c.who), ['firecrawl', 'scrapedo', 'scrapedo+super']);
});

test('Meesho: Firecrawl only — never Scrape.do (Akamai) nor the direct request', async () => {
  resetCredits();
  assert.deepEqual(routeFor('meesho', { js: true }), ['firecrawl']);
  const calls = fakeNetwork({ firecrawl: () => json(500, { success: false, error: 'boom' }) });
  await assert.rejects(fetchPage('https://www.meesho.com/search?q=x', { platform: 'meesho', js: true }), (err) => {
    assert.match(err.message, /Firecrawl is busy/);
    assert.doesNotMatch(err.message, /sd-test-token|fc-test-key/); // keys never in messages
    return true;
  });
  assert.deepEqual([...new Set(calls.map((c) => c.who))], ['firecrawl']);
});

test('a JS page through Scrape.do waits for the network and for a product', async () => {
  resetCredits();
  const calls = fakeNetwork({ firecrawl: () => json(402, { success: false }), scrapedo: () => html(200, PAGE) });
  await fetchPage('https://www.example-shop.in/s?q=x', { platform: 'amazon', js: true, waitSelector: 'a[href*="/p/"]' });
  const sd = calls.find((c) => c.who === 'scrapedo').url;
  assert.match(sd, /render=true/);
  assert.match(sd, /waitUntil=networkidle2/);
  assert.match(sd, /waitSelector=a%5Bhref/);
});

test('Scrape.do out of credits (401) → next service, keys never in the message', async () => {
  resetCredits();
  fakeNetwork({ firecrawl: () => json(402, {}), scrapedo: () => html(401, 'no credits'), direct: () => html(503, CAPTCHA) });
  await assert.rejects(fetchPage('https://www.flipkart.com/search?q=x', { platform: 'flipkart' }), (err) => {
    assert.match(err.message, /Firecrawl has no credits/);
    assert.match(err.message, /Scrape\.do has no credits/);
    assert.match(err.message, /Direct: robot check/);
    assert.doesNotMatch(err.message, /sd-test-token|fc-test-key/);
    return true;
  });
});

test('everything blocked → BlockedError listing what each service said', async () => {
  resetCredits();
  fakeNetwork({
    firecrawl: () => json(200, { success: true, data: { rawHtml: CAPTCHA, metadata: { statusCode: 200 } } }),
    scrapedo: () => html(200, CAPTCHA),
    'scrapedo+super': () => html(200, CAPTCHA),
    direct: () => html(503, CAPTCHA),
  });
  await assert.rejects(fetchPage('https://www.amazon.in/s?k=x', { platform: 'amazon' }), (err) => {
    assert.equal(err.name, 'BlockedError');
    assert.match(err.message, /Firecrawl: robot check/);
    assert.match(err.message, /Scrape\.do \(residential\): robot check/);
    assert.match(err.message, /Direct: robot check/);
    return true;
  });
});

test('a disguised block ("Site Maintenance", tiny page) moves on to the next service', async () => {
  resetCredits();
  const calls = fakeNetwork({
    firecrawl: () => json(200, { success: true, data: { rawHtml: '<html><head><title>Site Maintenance</title></head><body>Oops</body></html>', metadata: { statusCode: 200 } } }),
    scrapedo: () => html(200, PAGE),
  });
  const r = await fetchPage('https://www.myntra.com/kurti', { platform: 'myntra' });
  assert.equal(r.via, 'scrapedo');
  assert.deepEqual(calls.map((c) => c.who), ['firecrawl', 'scrapedo']);
});

test('Meesho (a browser page) gets twice the time: 90 s, not 45 s', async () => {
  resetCredits();
  const calls = fakeNetwork({ firecrawl: () => json(200, { success: true, data: { rawHtml: PAGE, metadata: { statusCode: 200 } } }) });
  await fetchPage('https://www.meesho.com/search?q=x', { platform: 'meesho', js: true });
  assert.equal(calls[0].body.timeout, 87000); // 90 s, less 3 s for our own wait
  await fetchPage('https://www.flipkart.com/search?q=x', { platform: 'flipkart' });
  assert.equal(calls[1].body.timeout, 42000); // a plain page: the usual 45 s
});

test('the LAST service times out → asked once more after a pause, and that can work', async () => {
  resetCredits();
  let n = 0;
  const calls = fakeNetwork({
    firecrawl: () => {
      n += 1;
      if (n === 1) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      return json(200, { success: true, data: { rawHtml: PAGE, metadata: { statusCode: 200 } } });
    },
  });
  const r = await fetchPage('https://www.meesho.com/search?q=x', { platform: 'meesho', js: true });
  assert.equal(r.via, 'firecrawl');
  assert.equal(calls.length, 2);
});

test('the last service can’t be reached twice → a plain-words error, no third try', async () => {
  resetCredits();
  const calls = fakeNetwork({ firecrawl: () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(fetchPage('https://www.meesho.com/search?q=x', { platform: 'meesho', js: true }), (err) => {
    assert.match(err.message, /couldn’t connect to it \(fetch failed\) — asked again · Firecrawl: couldn’t connect/);
    return true;
  });
  assert.equal(calls.length, 2);
});

test('a timeout with another service still to try → that service, no second try', async () => {
  resetCredits();
  const calls = fakeNetwork({
    firecrawl: () => { throw new DOMException('timeout', 'TimeoutError'); },
    scrapedo: () => html(200, PAGE),
  });
  const r = await fetchPage('https://www.flipkart.com/search?q=x', { platform: 'flipkart' });
  assert.equal(r.via, 'scrapedo');
  assert.deepEqual(calls.map((c) => c.who), ['firecrawl', 'scrapedo']);
});
