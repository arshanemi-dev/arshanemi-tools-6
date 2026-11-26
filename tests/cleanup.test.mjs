import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// A throwaway folder: lib/blobStore.js writes ./.data/ under the working
// directory when no Blob token is set — never the project's own data.
process.chdir(mkdtempSync(path.join(tmpdir(), 'pr-cleanup-')));
process.env.JWT_SECRET = 'test-secret';
process.env.TOOLS_NAME = 'cleanup-test';
delete process.env.BLOB_READ_WRITE_TOKEN;

const store = await import('../lib/research/store.js');
const cleanup = await import('../lib/research/cleanup.js');
const { listBlobJson } = await import('../lib/blobStore.js');

const product = (id, rank) => ({ id, platform: 'amazon', link: `https://www.amazon.in/dp/${id}`, title: `P ${id}`, rank, price: 100 });
const run = (...ps) => ({ products: ps, pagesRead: 1, error: null });
const meta = (id, platform = 'amazon') => ({ id, platform, query: 'kurti', fromPage: 1, toPage: 1 });
const exists = async (id) => !!(await store.readTrack(id));

test('setup: two users share one track; one track is only user 1’s', async () => {
  const A = await store.saveRun(meta('A'), run(product('X1', 1)), '2026-11-20');
  const B = await store.saveRun(meta('B', 'flipkart'), run(product('Y1', 1)), '2026-11-20');
  await store.registerTracks([A, B], 'u1');
  await store.registerTracks([A], 'u2');
  await store.updateUserSearches('u1', () => [{ id: 's1', kind: 'search', query: 'kurti', platforms: ['amazon', 'flipkart'], trackIds: ['A', 'B'] }]);
  await store.updateUserSearches('u2', () => [{ id: 's2', kind: 'search', query: 'kurti', platforms: ['amazon'], trackIds: ['A'] }]);
  const index = await store.readIndex();
  assert.deepEqual(index.find((e) => e.id === 'A').owners.sort(), ['u1', 'u2']);
  assert.deepEqual(index.find((e) => e.id === 'B').owners, ['u1']);
});

test('a daily read keeps the owners (it used to replace the whole entry)', async () => {
  await store.saveRun(meta('A'), run(product('X1', 2)), '2026-11-21');
  assert.deepEqual((await store.readIndex()).find((e) => e.id === 'A').owners.sort(), ['u1', 'u2']);
});

test('user 1 deletes their search: their own track goes, the shared one stays for user 2', async () => {
  const r = await cleanup.deleteSearches('u1', ['s1']);
  assert.deepEqual(r, { searches: 1, deletedData: 1, keptShared: 1 });
  assert.equal(await exists('B'), false); // nobody else had it — data deleted, daily read stopped
  assert.equal(await exists('A'), true);
  const index = await store.readIndex();
  assert.equal(index.some((e) => e.id === 'B'), false);
  assert.deepEqual(index.find((e) => e.id === 'A').owners, ['u2']);
  assert.deepEqual(await store.readUserSearches('u1'), []);
});

test('an imported sheet’s data is deleted with its search; delete all', async () => {
  const id = store.importTrackId('u2', 'my sheet');
  await store.saveImport({ id, query: 'my sheet' }, [{ link: 'https://www.meesho.com/x/p/1', date: '2026-11-01', platform: 'meesho', rank: 3 }]);
  await store.updateUserSearches('u2', (list) => [...list, { id: 'imp', kind: 'import', query: 'my sheet', platforms: ['meesho'], trackIds: [id] }]);
  const r = await cleanup.deleteSearches('u2', 'all');
  assert.equal(r.searches, 2);
  assert.equal(await exists(id), false);
  assert.equal(await exists('A'), false); // its last owner left
  assert.deepEqual(await store.readIndex(), []);
});

test('admin: clean up unused data, rebuilding owners for old entries', async () => {
  // C — a track whose search was refused (never in anyone's list); D — an old
  // entry from before owners were recorded, still used by u3.
  await store.saveRun(meta('C'), run(product('Z1', 1)), '2026-11-22');
  const D = await store.saveRun(meta('D'), run(product('W1', 1)), '2026-11-22');
  await store.registerTracks([D], null); // in the index, no owners
  await store.updateUserSearches('u3', () => [{ id: 's3', kind: 'search', query: 'kurti', platforms: ['amazon'], trackIds: ['D'] }]);
  const before = await cleanup.storageSummary();
  assert.equal(before.unusedTracks, 1);
  const r = await cleanup.cleanUnused();
  assert.equal(r.deletedTracks, 1);
  assert.equal(await exists('C'), false);
  assert.deepEqual((await store.readIndex()).find((e) => e.id === 'D').owners, ['u3']);
});

test('admin: delete history older than N days', async () => {
  const old = '2020-01-01';
  await store.saveRun(meta('D'), run(product('W1', 1), product('OLD', 9)), old);
  const r = await cleanup.trimHistory(30);
  assert.ok(r.snapshots >= 2);
  const D = await store.readTrack('D');
  assert.ok(!Object.values(D.products).some((p) => p.h[old]));
  assert.equal(D.products['amazon:OLD'], undefined); // nothing left of it
  assert.equal(D.products['amazon:W1'].firstSeen, '2026-11-22');
});

test('admin: delete everything', async () => {
  const r = await cleanup.wipeAll();
  assert.ok(r.deleted > 0);
  assert.deepEqual(await listBlobJson('research/'), []);
});

test('deleting a search made before owners existed still deletes data nobody else uses', async () => {
  // E and F: in the daily-read list with no owners (old). u5 and u6 both use E; only u5 uses F.
  const E = await store.saveRun(meta('E'), run(product('E1', 1)), '2026-11-23');
  const F = await store.saveRun(meta('F'), run(product('F1', 1)), '2026-11-23');
  await store.registerTracks([E, F], null);
  await store.updateUserSearches('u5', () => [{ id: 's5', kind: 'search', query: 'kurti', platforms: ['amazon'], trackIds: ['E', 'F'] }]);
  await store.updateUserSearches('u6', () => [{ id: 's6', kind: 'search', query: 'kurti', platforms: ['amazon'], trackIds: ['E'] }]);
  const r = await cleanup.deleteSearches('u5', ['s5']);
  assert.deepEqual(r, { searches: 1, deletedData: 1, keptShared: 1 });
  assert.equal(await exists('F'), false);
  assert.equal(await exists('E'), true);
  assert.deepEqual((await store.readIndex()).find((e) => e.id === 'E').owners, ['u6']);
});

test('a user with no searches left keeps no file, and is not counted', async () => {
  const before = await cleanup.storageSummary();
  await cleanup.deleteSearches('u6', 'all');
  assert.equal(await (await import('../lib/blobStore.js')).readBlobJson('research/users/u6', null), null);
  assert.equal((await cleanup.storageSummary()).users, before.users - 1);
});
