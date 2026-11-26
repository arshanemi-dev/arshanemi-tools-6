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

test('the shared page range: default 1–3, saved, checked', async () => {
  assert.deepEqual(await config.readRange(), { fromPage: 1, toPage: 3 });
  assert.deepEqual((await config.saveRange({ fromPage: 2, toPage: 4 })).range, { fromPage: 2, toPage: 4 });
  assert.deepEqual(await config.readRange(), { fromPage: 2, toPage: 4 });
  assert.match((await config.saveRange({ fromPage: 5, toPage: 2 })).error, /before/);
  assert.match((await config.saveRange({ fromPage: 1, toPage: 15 })).error, /At most 10/);
});

test('a new row is read with the shared range; same link or search twice is refused', async () => {
  const range = await config.readRange();
  const a = entries.makeEntry({ platform: 'flipkart', category: 'Cotton Kurti', url: null }, [], range);
  assert.equal(a.entry.name, 'flipkart_cotton-kurti');
  assert.deepEqual([a.entry.fromPage, a.entry.toPage], [2, 4]);
  await entries.updateEntries(() => [a.entry]);
  // Same market place + same category (any spacing / case), no link → same search.
  assert.match(entries.makeEntry({ platform: 'flipkart', category: 'cotton  KURTI' }, [a.entry], range).error, /already exists/);
});

test('moving entries onto a new range — and back brings the old history back', async () => {
  const [before] = await entries.readEntries();
  await config.saveRange({ fromPage: 1, toPage: 2 });
  const [moved] = await config.alignEntries([before.id], await config.readRange());
  assert.deepEqual([moved.fromPage, moved.toPage], [1, 2]);
  assert.notEqual(moved.trackId, before.trackId);
  await config.saveRange({ fromPage: 2, toPage: 4 });
  const [back] = await config.alignEntries([before.id], await config.readRange());
  assert.equal(back.trackId, before.trackId); // the same saved data as before
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
  const other = entries.makeEntry({ platform: 'amazon', category: 'earbuds' }, list, await config.readRange()).entry;
  const all = [...list, other];

  const daily = entries.editEntry(e, { autoDaily: false }, all);
  assert.equal(daily.entry.autoDaily, false);
  assert.equal(daily.newHistory, false);
  assert.equal(daily.entry.trackId, e.trackId);

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
