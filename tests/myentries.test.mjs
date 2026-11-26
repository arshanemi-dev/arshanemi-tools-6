import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { combineEntries, listedEntries, MAX_PICK, pickLabel, startPick } from '../lib/research/myEntries.js';
import { dailyRows, mergeProducts } from '../lib/research/metrics.js';

// A throwaway folder: lib/blobStore.js writes ./.data/ under the working
// directory when no Blob token is set — never the project's own data.
process.chdir(mkdtempSync(path.join(tmpdir(), 'pr-my-entries-')));
process.env.JWT_SECRET = 'test-secret';
process.env.TOOLS_NAME = 'my-entries-test';
delete process.env.BLOB_READ_WRITE_TOKEN;

const entries = await import('../lib/research/entries.js');
const cleanup = await import('../lib/research/cleanup.js');
const { readBlobJson, writeBlobJson } = await import('../lib/blobStore.js');

const E = [
  { id: 'a', name: 'flipkart_kurti', locked: true },
  { id: 'b', name: 'amazon_kurti', locked: false },
  { id: 'c', name: 'meesho_blouse', locked: false },
];
const ids = (list) => list.map((e) => e.id);

test('Entries ▾ lists my saved entries — every entry when I saved none (or they were deleted)', () => {
  assert.deepEqual(ids(listedEntries(E, [])), ['a', 'b', 'c']);
  assert.deepEqual(ids(listedEntries(E, ['c', 'a'])), ['a', 'c']); // the list's own order
  assert.deepEqual(ids(listedEntries(E, ['gone'])), ['a', 'b', 'c']);
});

test('the pick to start with: the remembered ones still listed, else the first unlocked one', () => {
  assert.deepEqual(startPick(E, ['c', 'gone', 'a']), ['c', 'a']);
  assert.deepEqual(startPick(E, null), ['b']); // a is locked → b
  assert.deepEqual(startPick([E[0]], []), ['a']); // only locked ones → the first
  assert.deepEqual(startPick([], ['a']), []);
  const many = Array.from({ length: 15 }, (_, i) => ({ id: `e${i}`, name: `e${i}` }));
  assert.equal(startPick(many, many.map((e) => e.id)).length, MAX_PICK);
});

test('labels: one, two, or "+ N more"', () => {
  assert.equal(pickLabel(['x']), 'x');
  assert.equal(pickLabel(['x', 'y']), 'x, y');
  assert.equal(pickLabel(['x', 'y', 'z']), 'x + 2 more');
});

const track = (id, products) => ({ id, query: 'q', products: Object.fromEntries(products.map((p) => [p.key, p])) });
const prod = (key, rank) => ({ key, id: key, platform: 'amazon', link: `https://x/${key}`, title: key, h: { '2026-11-26': { r: rank } } });
const part = (id, name, products) => ({ entry: { id, name }, data: { search: { id, name, query: name, kind: 'search', fromPage: 1, toPage: 3 }, tracks: [track(`t-${id}`, products)], status: [{ id: `t-${id}`, platform: 'amazon', label: 'Amazon', products: products.length }] } });

test('one entry opens exactly as before', () => {
  const one = combineEntries([part('b', 'amazon_kurti', [prod('amazon:P1', 1)])], 'b');
  assert.equal(one.search.id, 'b');
  assert.equal(one.search.query, 'amazon_kurti');
  assert.deepEqual(Object.keys(one.tracks[0].products), ['amazon:P1']);
  assert.equal(one.status[0].label, 'Amazon');
});

test('several entries together: the same product keeps one history per entry, rows say whose', () => {
  const both = combineEntries([
    part('b', 'amazon_kurti', [prod('amazon:P1', 1), prod('amazon:P2', 2)]),
    part('d', 'amazon_cotton-kurti', [prod('amazon:P1', 7)]), // P1 is in both lists, at different ranks
  ], 'b,d');
  assert.equal(both.search.id, 'b,d');
  assert.deepEqual(both.search.entries, ['amazon_kurti', 'amazon_cotton-kurti']);
  assert.deepEqual(both.status.map((s) => s.label), ['amazon_kurti', 'amazon_cotton-kurti']);
  const products = mergeProducts(both.tracks);
  assert.equal(products.length, 3); // not merged into 2
  const rows = dailyRows(products);
  const p1 = rows.filter((r) => r.title === 'amazon:P1').map((r) => [r.entry, r.rank]).sort();
  assert.deepEqual(p1, [['amazon_cotton-kurti', 7], ['amazon_kurti', 1]]);
  assert.equal(combineEntries([], 'x'), null);
});

test('saving per user: only existing entries can be added; each user has their own list', async () => {
  let r = await entries.changeMyEntries('u1', { add: ['a', 'b', 'nope'] }, ['a', 'b', 'c']);
  assert.deepEqual(r.myEntries, ['a', 'b']);
  assert.equal(r.added, 2);
  assert.deepEqual(r.unknown, ['nope']);
  r = await entries.changeMyEntries('u1', { add: ['b'] }, ['a', 'b', 'c']); // already there
  assert.equal(r.added, 0);
  r = await entries.changeMyEntries('u1', { remove: ['a'], add: ['c'] }, ['a', 'b', 'c']);
  assert.deepEqual(r.myEntries, ['b', 'c']);
  assert.equal(r.removed, 1);
  // An entry deleted since is dropped on the next change.
  r = await entries.changeMyEntries('u1', { add: ['a'] }, ['a', 'c']);
  assert.deepEqual(r.myEntries, ['c', 'a']);
  assert.deepEqual((await entries.readUserLists('u1')).myEntries, ['c', 'a']);
  assert.deepEqual((await entries.readUserLists('u2')).myEntries, []);
});

test('saved entries and unlocks live side by side in the user file', async () => {
  await entries.addUnlocked('u1', 'a');
  assert.deepEqual(await entries.readUserLists('u1'), { unlocked: ['a'], myEntries: ['c', 'a'] });
  await entries.changeMyEntries('u1', { remove: ['c'] }, ['a', 'c']);
  assert.deepEqual(await entries.readUnlocked('u1'), ['a']); // unlocks untouched
});

test('Clean up keeps a user’s saved entries (even with no unlocks)', async () => {
  await writeBlobJson('research/entries', []);
  await writeBlobJson('research/users/u3', { userId: 'u3', searches: [{ id: 'old' }], myEntries: ['c'] });
  await cleanup.cleanUnused();
  assert.deepEqual(await readBlobJson('research/users/u3', null), { userId: 'u3', unlocked: [], myEntries: ['c'] });
});
