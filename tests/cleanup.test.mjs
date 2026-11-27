import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// A throwaway folder: lib/blobStore.js writes ./.data/ under the working
// directory when no Blob token is set — never the project's own data.
process.chdir(mkdtempSync(path.join(tmpdir(), 'pr-entries-')));
process.env.JWT_SECRET = 'test-secret';
process.env.TOOLS_NAME = 'entries-test';
delete process.env.BLOB_READ_WRITE_TOKEN;

const store = await import('../lib/research/store.js');
const entries = await import('../lib/research/entries.js');
const cleanup = await import('../lib/research/cleanup.js');
const { listBlobJson, readBlobJson, writeBlobJson } = await import('../lib/blobStore.js');

const product = (id, rank) => ({ id, platform: 'flipkart', link: `https://www.flipkart.com/x/p/itm${id}`, title: `P ${id}`, rank, price: 100 });
const run = (...ps) => ({ products: ps, pagesRead: 1, error: null });
const exists = async (id) => !!(await store.readTrack(id));

test('old searches become entries the first time the list is read — same saved data', async () => {
  // Before entries existed: a user's keyword search on 2 market places, and a link search.
  const kw = store.searchTrackId('flipkart', 'Cotton Kurti', { fromPage: 1, toPage: 3 });
  const kw2 = store.searchTrackId('amazon', 'Cotton Kurti', { fromPage: 1, toPage: 3 });
  const link = 'https://www.myntra.com/kurtas';
  const lt = store.urlTrackId('myntra', link, { fromPage: 1, toPage: 2 });
  await store.saveRun({ id: kw, platform: 'flipkart', query: 'Cotton Kurti', fromPage: 1, toPage: 3 }, run(product('A', 1)), '2026-11-20');
  await writeBlobJson('research/users/u1', { userId: 'u1', searches: [
    { id: 's1', kind: 'search', query: 'Cotton Kurti', platforms: ['flipkart', 'amazon'], fromPage: 1, toPage: 3, trackIds: [kw, kw2] },
    { id: 's2', kind: 'url', query: 'Myntra · kurtas', urls: [link], platforms: ['myntra'], fromPage: 1, toPage: 2, trackIds: [lt] },
  ] });
  // The same keyword search by another user doesn't make a second entry.
  await writeBlobJson('research/users/u2', { userId: 'u2', searches: [{ id: 's3', kind: 'search', query: 'cotton kurti', platforms: ['flipkart'], pages: 3, trackIds: [kw] }] });

  const list = await entries.readEntries();
  assert.deepEqual(list.map((e) => e.name).sort(), ['amazon_cotton-kurti', 'flipkart_cotton-kurti', 'myntra_kurtas']);
  const fk = list.find((e) => e.name === 'flipkart_cotton-kurti');
  assert.equal(fk.trackId, kw); // its history is kept
  assert.equal(fk.autoDaily, true);
  assert.equal(list.find((e) => e.name === 'myntra_kurtas').url, link);
  assert.equal((await entries.readEntries()).length, 3); // converted once
});

test('a new entry: name = marketplace_category, unique; the link must be that market place’s', async () => {
  const list = await entries.readEntries();
  const ok = entries.makeEntry({ platform: 'meesho', category: '  Women Tops!! ', url: null }, list);
  assert.equal(ok.entry.name, 'meesho_women-tops');
  assert.equal(ok.entry.kind, 'search');
  assert.equal(ok.entry.autoDaily, true);
  assert.match(ok.entry.trackId, /^meesho-women-tops-[0-9a-f]+$/); // what it reads — no pages
  assert.match(entries.makeEntry({ platform: 'flipkart', category: 'cotton kurti' }, list).error, /already exists/);
  assert.match(entries.makeEntry({ platform: 'flipkart', category: 'bottles', url: 'https://www.amazon.in/s?k=bottle' }, list).error, /isn’t a Flipkart page/);
  assert.match(entries.makeEntry({ platform: 'amazon', category: 'x' }, list).error, /2–80/);
  assert.match(entries.makeEntry({ category: 'kurti' }, list).error, /market place/);
  const linked = entries.makeEntry({ platform: 'myntra', category: 'kurta sets', url: 'https://www.myntra.com/kurtas' }, list);
  assert.match(linked.error, /already reads this same link/); // myntra_kurtas reads that link
});

test('each user has their own file: saved entries + their plans', async () => {
  assert.deepEqual(await entries.readUserDoc('u9'), { myEntries: [], plans: {} });
  const out = await entries.updateUserDoc('u9', async (doc) => ({ doc: { ...doc, myEntries: ['e1'], plans: { e1: { paidUntil: '2030-01-01T00:00:00.000Z', autoRenew: true } } }, result: 'saved' }));
  assert.equal(out, 'saved');
  assert.deepEqual((await entries.readUserDoc('u9')).myEntries, ['e1']);
  // A change that returns no doc writes nothing.
  await entries.updateUserDoc('u9', async () => ({ doc: null, result: null }));
  assert.deepEqual((await entries.readUserDoc('u9')).myEntries, ['e1']);
  assert.deepEqual((await entries.readUserDoc('u8')).myEntries, []);
});

test('deleting an entry deletes its saved data — unless another entry reads the same page', async () => {
  const list = await entries.readEntries();
  const fk = list.find((e) => e.name === 'flipkart_cotton-kurti');
  // A second entry on the same track (made by hand — the form refuses it).
  await entries.updateEntries((l) => [...l, { ...fk, id: 'twin', name: 'flipkart_cotton-kurti-2' }]);
  let r = await cleanup.deleteEntries([fk.id]);
  assert.deepEqual(r, { entries: 1, deletedData: 0, keptShared: 1 });
  assert.equal(await exists(fk.trackId), true);
  r = await cleanup.deleteEntries(['twin']);
  assert.deepEqual(r, { entries: 1, deletedData: 1, keptShared: 0 });
  assert.equal(await exists(fk.trackId), false);
});

test('the daily switch is kept, and stats show what an entry holds', async () => {
  const [e] = await entries.readEntries();
  await entries.updateEntries((l) => l.map((x) => (x.id === e.id ? { ...x, autoDaily: false } : x)));
  await store.saveRun({ id: e.trackId, platform: e.platform, query: e.category, fromPage: e.fromPage, toPage: e.toPage }, run(product('B', 1), product('C', 2)), '2026-11-24');
  const [withStats] = await cleanup.entryStats((await entries.readEntries()).filter((x) => x.id === e.id));
  assert.equal(withStats.autoDaily, false);
  assert.equal(withStats.products, 2);
  assert.equal(withStats.lastRead, '2026-11-24');
});

test('stats say how the LATEST read went — products got, pages read, why it stopped', async () => {
  const meta = { id: 'pc-track', platform: 'amazon', query: 'bottle', want: 100 };
  const fake = { id: 'pc', kind: 'search', trackId: 'pc-track' };
  await store.saveRun(meta, { ...run(product('P1', 1)), pagesRead: 3, stoppedBy: 'target' }, '2026-11-25');
  let [s] = await cleanup.entryStats([fake]);
  assert.deepEqual(s.lastRun, { count: 1, pages: 3, scrolls: 0, target: 100, stoppedBy: 'target', error: null });
  // The next read is blocked on page 1 — that is what shows now.
  await store.saveRun(meta, { products: [], pagesRead: 0, stoppedBy: 'failed', error: 'Page 1: blocked' }, '2026-11-26');
  [s] = await cleanup.entryStats([fake]);
  assert.deepEqual(s.lastRun, { count: 0, pages: 0, scrolls: 0, target: 100, stoppedBy: 'failed', error: 'Page 1: blocked' });
  assert.equal(s.lastError, 'Page 1: blocked');
});

test('clean up: saved data no entry uses goes, and the old search lists (saved entries + plans kept)', async () => {
  await store.saveRun({ id: 'orphan', platform: 'amazon', query: 'x', fromPage: 1, toPage: 1 }, run(product('O', 1)), '2026-11-24');
  const plan = { paidUntil: '2030-01-01T00:00:00.000Z', autoRenew: true };
  await entries.updateUserDoc('u1', async (doc) => ({ doc: { ...doc, myEntries: ['some-entry'], plans: { 'some-entry': plan } }, result: null }));
  const before = await cleanup.storageSummary();
  assert.ok(before.unusedTracks >= 1);
  assert.ok(before.users >= 1); // users with entries
  const r = await cleanup.cleanUnused();
  assert.ok(r.deletedTracks >= 1);
  assert.equal(await exists('orphan'), false);
  assert.deepEqual(await readBlobJson('research/users/u1', null), { userId: 'u1', myEntries: ['some-entry'], plans: { 'some-entry': plan } });
  assert.equal(await readBlobJson('research/users/u2', null), null);
  assert.equal((await cleanup.storageSummary()).unusedTracks, 0);
});

test('trim old history', async () => {
  const [e] = await entries.readEntries();
  await store.saveRun({ id: e.trackId, platform: e.platform, query: e.category, fromPage: e.fromPage, toPage: e.toPage }, run(product('B', 1), product('OLD', 9)), '2020-01-01');
  const r = await cleanup.trimHistory(30);
  assert.ok(r.snapshots >= 2);
  const t = await store.readTrack(e.trackId);
  assert.equal(t.products['flipkart:OLD'], undefined);
  assert.equal(t.products['flipkart:B'].firstSeen, '2026-11-24');
});

test('delete everything — and the old searches don’t come back as entries', async () => {
  const r = await cleanup.wipeAll();
  assert.ok(r.deleted > 0);
  assert.deepEqual(await entries.readEntries(), []);
  assert.deepEqual((await listBlobJson('research/')).map((b) => b.key), ['research/entries']);
});
