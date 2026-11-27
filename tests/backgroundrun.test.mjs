import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Search in the background: the run record is saved at once, the reading
// goes on, the result is saved in the record and in the entry's own data.
// A throwaway folder (never the project's data); the network is faked —
// Snapdeal pages with 3 products each, through the plain direct request.
process.chdir(mkdtempSync(path.join(tmpdir(), 'pr-run-')));
process.env.JWT_SECRET = 'test-secret';
process.env.TOOLS_NAME = 'run-test';
process.env.SCRAPER_ORDER = 'direct';
delete process.env.FIRECRAWL_API_KEY;
delete process.env.SCRAPEDO_TOKEN;
delete process.env.BLOB_READ_WRITE_TOKEN;

const entries = await import('../lib/research/entries.js');
const store = await import('../lib/research/store.js');
const { readRun, runInBackground, startRun, STALE_MS } = await import('../lib/research/backgroundRun.js');
const { readBlobJson, writeBlobJson } = await import('../lib/blobStore.js');

await writeBlobJson('research/entries', []);

const tuple = (id) => `<div class="product-tuple-listing" data-js-pog-id="${id}"><a class="dp-widget-link" href="https://www.snapdeal.com/product/bottle-${id}/${id}"><img class="product-image" src="b.jpg"></a><p class="product-title">Bottle ${id}</p><span class="product-price" data-price="249">Rs. 249</span></div>`;
globalThis.fetch = async (url) => {
  const page = Number(new URL(String(url)).searchParams.get('page') || 1);
  const ids = [1, 2, 3].map((i) => page * 10 + i);
  return new Response(`<html><body>${ids.map(tuple).join('')}${'<!-- padding -->'.repeat(400)}</body></html>`, { status: 200 });
};

test('Search: saved as running at once, read in the background, saved as done', async () => {
  const e = entries.makeEntry({ platform: 'snapdeal', category: 'steel bottle', targetProducts: 5 }, []).entry;
  await entries.updateEntries(() => [e]);

  const { run, busy } = await startRun([e]);
  assert.equal(busy, undefined);
  assert.equal(run.state, 'running');
  assert.deepEqual(run.entryIds, [e.id]);
  assert.equal((await readRun()).state, 'running'); // what the page sees right away

  // A second Search while it runs → the running one comes back, nothing new starts.
  const again = await startRun([e]);
  assert.equal(again.busy, true);
  assert.equal(again.run.id, run.id);

  await runInBackground(run, [e]);
  const done = await readRun();
  assert.equal(done.state, 'done');
  assert.equal(done.jobs[0].state, 'done');
  assert.deepEqual(done.results.map((r) => [r.id, r.products]), [[e.id, 5]]);
  assert.ok(done.finishedAt >= done.startedAt);
  // The entry's own data has today's products — the table shows them.
  const track = await store.readTrack(e.trackId);
  assert.equal(Object.keys(track.products).length, 5);
});

test('a run that went silent (the server’s time limit) shows as stopped — and a new Search can start', async () => {
  const run = await readBlobJson('research/run', null);
  const long = Date.now() - STALE_MS - 1000;
  await writeBlobJson('research/run', { ...run, id: 'old', state: 'running', startedAt: long, updatedAt: long, jobs: [{ ...run.jobs[0], state: 'reading' }] });
  const seen = await readRun();
  assert.equal(seen.state, 'stopped');
  assert.match(seen.error, /stopped before finishing/);
  assert.equal(seen.jobs[0].state, 'failed');
  const [e] = await entries.readEntries();
  const next = await startRun([e]);
  assert.equal(next.busy, undefined);
  assert.notEqual(next.run.id, 'old');
});
