// The master admin's Search, run in the BACKGROUND. Server-only.
//
// Pressing Search saves a run record and answers at once; the reading goes
// on after the answer (the route's `after()` — next/server) and writes its
// progress into the record as it goes. The page shows that record (a window
// with live progress, or a slim strip once the window is closed), asks for
// it every few seconds, and reloads the table when the run is over. Leaving
// or reloading the page changes nothing: the run carries on and its results
// are saved either way (each entry's own data — lib/research/store.js).
//
//   research/run   the latest run: { id, state: 'running' | 'done' |
//                  'stopped', label, entryIds, startedAt, updatedAt,
//                  finishedAt, jobs: [{ id, platform, label, state, page,
//                  pages, want, products, added, error }], results: [{ id,
//                  name, platform, products, error, blocked }], error }
//
// One run at a time. A run that stops sending signs of life (the server's
// time limit ended it, or the server restarted) is shown as 'stopped' once
// STALE_MS has passed without a word from it — what it read before is kept.

import { randomUUID } from 'node:crypto';
import { readBlobJson, writeBlobJson } from '@/lib/blobStore';
import { jobOfEntry } from './entries';
import { ensureJobs } from './service';

const RUN_KEY = 'research/run';
const SAVE_EVERY_MS = 4000; // progress is written at most this often…
const HEARTBEAT_MS = 60_000; // …and at least this often, even mid-page
export const STALE_MS = 150_000; // no word for this long = it stopped

const stale = (run, now = Date.now()) => run?.state === 'running' && now - (run.updatedAt || run.startedAt || 0) > STALE_MS;

// The latest run (null = none yet). A running one that went silent is
// marked 'stopped' (and saved so).
export async function readRun() {
  const run = await readBlobJson(RUN_KEY, null);
  if (!stale(run)) return run;
  const stopped = {
    ...run,
    state: 'stopped',
    finishedAt: run.updatedAt || Date.now(),
    error: 'It stopped before finishing (the server’s time limit, or a restart). What it read before that is saved — press Search again for the rest.',
    jobs: run.jobs.map((j) => (['done', 'cached', 'failed'].includes(j.state) ? j : { ...j, state: 'failed', error: j.error || 'not finished' })),
  };
  await writeBlobJson(RUN_KEY, stopped);
  return stopped;
}

// A new run for these entries → { run } (saved, 'running'), or { run, busy:
// true } when one is still running (it is returned instead).
export async function startRun(entries) {
  const current = await readRun();
  if (current?.state === 'running') return { run: current, busy: true };
  const now = Date.now();
  const run = {
    id: randomUUID(),
    state: 'running',
    label: entries.length === 1 ? entries[0].name : `${entries.length} entries`,
    entryIds: entries.map((e) => e.id),
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    jobs: entries.map((e) => {
      const job = jobOfEntry(e);
      return { id: job.id, platform: job.platform, label: job.label, state: 'waiting', page: 0, pages: null, want: job.want, products: 0, error: null };
    }),
    results: [],
    error: null,
  };
  await writeBlobJson(RUN_KEY, run);
  return { run };
}

// Does the reading (called after the answer was sent). Never throws: a
// failure becomes the run's own 'stopped' state.
export async function runInBackground(run, entries) {
  const doc = { ...run, jobs: run.jobs.map((j) => ({ ...j })) };
  let writing = Promise.resolve();
  let lastSave = 0;
  const save = () => {
    lastSave = Date.now();
    doc.updatedAt = lastSave;
    const snapshot = JSON.parse(JSON.stringify(doc));
    writing = writing.then(() => writeBlobJson(RUN_KEY, snapshot)).catch((err) => console.error('[research] run progress not saved:', err?.message));
    return writing;
  };
  const heartbeat = setInterval(save, HEARTBEAT_MS);
  try {
    const jobs = entries.map(jobOfEntry);
    const results = await ensureJobs(jobs, {
      force: true,
      onProgress: (ev) => {
        const job = doc.jobs.find((j) => j.id === ev.id);
        if (!job) return;
        Object.assign(job, ev);
        const finished = ['done', 'cached', 'failed'].includes(ev.state);
        if (finished || Date.now() - lastSave >= SAVE_EVERY_MS) save();
      },
    });
    doc.results = results.map((r) => ({
      id: entries.find((e) => e.trackId === r.id)?.id,
      name: r.label,
      platform: r.platform,
      products: r.track?.runs?.[0]?.count ?? 0,
      error: r.error,
      blocked: !!r.blocked,
    }));
    doc.state = 'done';
  } catch (err) {
    console.error('[research] background run failed:', err);
    doc.state = 'stopped';
    doc.error = 'Something went wrong on our side while reading — what was read before that is saved. Try again in a moment.';
  } finally {
    clearInterval(heartbeat);
  }
  doc.finishedAt = Date.now();
  // Don't write over a newer run (this one was already given up on as
  // stopped, and another Search has started since).
  const now = await readBlobJson(RUN_KEY, null).catch(() => null);
  await writing;
  if (!now || now.id === doc.id) await save();
}
