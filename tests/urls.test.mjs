import test from 'node:test';
import assert from 'node:assert/strict';
import { listingLabel, pageUrlFor, readListingUrl } from '../data/marketplaces.js';

process.env.JWT_SECRET = 'test-secret';
const { jobsOf, planOf } = await import('../lib/research/service.js');

test('a pasted listing link is cleaned: https, no page number, no tracking, fixed order', () => {
  const r = readListingUrl('http://www.flipkart.com/clothing/women-kurtas/pr?sid=clo,rkt&otracker=nmenu_1&page=4&utm_source=x#top');
  assert.equal(r.platform, 'flipkart');
  assert.equal(r.url, 'https://www.flipkart.com/clothing/women-kurtas/pr?sid=clo%2Crkt');
  // Same page pasted with other tracking → same link → same search (never charged twice).
  assert.equal(readListingUrl('https://www.flipkart.com/clothing/women-kurtas/pr?otracker=zz&sid=clo,rkt').url, r.url);
});

test('links that can’t be read say why, in plain words', () => {
  assert.match(readListingUrl('https://www.amazon.in/Some-Thing/dp/B0ABCDEF12/ref=x').error, /one product’s page/);
  assert.match(readListingUrl('https://www.flipkart.com/x/p/itm123abc?pid=AB').error, /one product’s page/);
  assert.match(readListingUrl('https://www.myntra.com/kurtas/libas/abc/12345/buy').error, /one product’s page/);
  assert.match(readListingUrl('https://www.ajio.com/women-kurtas/c/830316').error, /Only Amazon, Flipkart/);
  assert.match(readListingUrl('cotton kurti').error, /isn’t a link/);
});

test('page N of a link uses each marketplace’s own page parameter', () => {
  const m = readListingUrl('https://www.myntra.com/kurtas?f=Brand%3ALibas&p=3').url;
  assert.equal(pageUrlFor('myntra', m, 2), 'https://www.myntra.com/kurtas?f=Brand%3ALibas&p=2');
  assert.equal(pageUrlFor('myntra', m, 1), m);
  const a = readListingUrl('https://www.amazon.in/s?k=steel+bottle&rh=n%3A1380441031&ref=sr_pg_2').url;
  assert.match(pageUrlFor('amazon', a, 3), /[?&]page=3/);
});

test('labels read like names', () => {
  assert.equal(listingLabel('https://www.flipkart.com/clothing/women-kurtas/pr?sid=clo'), 'Flipkart · women kurtas');
  assert.equal(listingLabel('https://www.amazon.in/s?k=steel+bottle'), 'Amazon · steel bottle');
});

test('a keyword search → one job per marketplace; a link search → one job per link', () => {
  const kw = jobsOf({ kind: 'search', query: 'kurti', platforms: ['amazon', 'myntra'], fromPage: 1, toPage: 3 });
  assert.deepEqual(kw.map((j) => j.platform), ['amazon', 'myntra']);
  assert.ok(kw.every((j) => j.url === null && j.query === 'kurti'));
  assert.match(kw[0].id, /^amazon-kurti-.*-p3$/); // same id as before ranges/links existed

  const links = ['https://www.flipkart.com/clothing/women-kurtas/pr?sid=clo', 'https://www.myntra.com/kurtas'];
  const ln = jobsOf({ kind: 'url', urls: links, fromPage: 2, toPage: 4 });
  assert.deepEqual(ln.map((j) => j.platform), ['flipkart', 'myntra']);
  assert.equal(ln[0].url, links[0]);
  assert.match(ln[0].id, /^url-flipkart-.*-p2-4$/);
  assert.deepEqual(planOf({ kind: 'url', urls: links, fromPage: 1, toPage: 1 }).map((j) => j.label), ['Flipkart · women kurtas', 'Myntra · kurtas']);
  // Different page range → a different track.
  assert.notEqual(jobsOf({ kind: 'url', urls: links, fromPage: 1, toPage: 4 })[0].id, ln[0].id);
});
