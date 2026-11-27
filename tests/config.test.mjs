import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// A throwaway folder — never the project's own data.
process.chdir(mkdtempSync(path.join(tmpdir(), 'pr-config-')));
process.env.JWT_SECRET = 'test-secret';
process.env.TOOLS_NAME = 'config-test';
delete process.env.BLOB_READ_WRITE_TOKEN;

const entries = await import('../lib/research/entries.js');
const config = await import('../lib/research/config.js');
const { writeBlobJson } = await import('../lib/blobStore.js');

await writeBlobJson('research/entries', []); // start empty (no old searches to convert)

test('a new row reads 100 products by default, no pages; same link or search twice is refused', async () => {
  const a = entries.makeEntry({ platform: 'flipkart', category: 'Cotton Kurti', url: null }, []);
  assert.equal(a.entry.name, 'flipkart_cotton-kurti');
  assert.equal(a.entry.targetProducts, 100);
  assert.equal(a.entry.fromPage, undefined);
  assert.doesNotMatch(a.entry.trackId, /-p\d/); // no pages in its data id
  assert.equal(entries.jobOfEntry(a.entry).want, 100);
  await entries.updateEntries(() => [a.entry]);
  // Same market place + same category (any spacing / case), no link → same search.
  assert.match(entries.makeEntry({ platform: 'flipkart', category: 'cotton  KURTI' }, [a.entry]).error, /already exists/);
});

test('categories: start from the entries’ own, any letter case is the same one', async () => {
  assert.deepEqual(await config.readCategories(), ['Cotton Kurti']);
  const r = await config.addCategory('  wireless   earbuds ');
  assert.equal(r.category, 'wireless earbuds');
  assert.deepEqual(r.categories, ['Cotton Kurti', 'wireless earbuds']);
  assert.equal((await config.addCategory('COTTON KURTI')).category, 'Cotton Kurti');
  assert.match((await config.addCategory('x')).error, /2–60/);
});

test('editing a row: new name + new history when what it reads changes; checks like adding', async () => {
  const list = await entries.readEntries();
  const [e] = list;
  const other = entries.makeEntry({ platform: 'amazon', category: 'earbuds' }, list).entry;
  const all = [...list, other];

  const daily = entries.editEntry(e, { autoDaily: false }, all);
  assert.equal(daily.entry.autoDaily, false);
  assert.equal(daily.entry.everyDays, 0);
  assert.equal(daily.newHistory, false);
  assert.equal(daily.entry.trackId, e.trackId);

  // Read every N days + products to read: saved, same history; bad numbers refused.
  const numbers = entries.editEntry(e, { everyDays: 3, targetProducts: '250' }, all);
  assert.deepEqual([numbers.entry.everyDays, numbers.entry.autoDaily, numbers.entry.targetProducts], [3, true, 250]);
  assert.equal(numbers.entry.trackId, e.trackId);
  assert.equal(entries.jobOfEntry(numbers.entry).want, 250);
  assert.match(entries.editEntry(e, { everyDays: 400 }, all).error, /0 to 365/);
  assert.match(entries.editEntry(e, { targetProducts: '' }, all).error, /1 to 1000/);
  assert.match(entries.editEntry(e, { targetProducts: 2000 }, all).error, /1 to 1000/);
  const fresh = entries.makeEntry({ platform: 'meesho', category: 'sarees', everyDays: 7, targetProducts: 60 }, all).entry;
  assert.deepEqual([fresh.everyDays, fresh.autoDaily, fresh.targetProducts], [7, true, 60]);
  // An entry made while the page range existed keeps its data id; with no
  // number saved it reads the default.
  const older = { ...e, targetProducts: undefined, fromPage: 1, toPage: 3, trackId: 'flipkart-cotton-kurti-abc-p3' };
  assert.equal(entries.jobOfEntry(older).want, 100);
  assert.equal(entries.editEntry(older, { targetProducts: 40 }, all).entry.trackId, 'flipkart-cotton-kurti-abc-p3');

  const moved = entries.editEntry(e, { category: 'Kurta Sets' }, all);
  assert.equal(moved.entry.name, 'flipkart_kurta-sets');
  assert.equal(moved.entry.id, e.id); // same entry — users' unlocks stay
  assert.equal(moved.newHistory, true);

  assert.match(entries.editEntry(e, { platform: 'amazon', category: 'earbuds' }, all).error, /already exists/);
  assert.match(entries.editEntry(e, { url: 'https://www.myntra.com/kurtas' }, all).error, /isn’t a Flipkart page/);
  const linked = entries.editEntry(e, { url: 'https://www.flipkart.com/clothing/kurtas/pr?sid=clo' }, all);
  assert.equal(linked.entry.kind, 'url');
  assert.equal(linked.entry.name, 'flipkart_cotton-kurti'); // its own name isn't "taken" by itself
});
