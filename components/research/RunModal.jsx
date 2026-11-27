'use client';

import { CheckCircle2, Eye, Loader2, XCircle } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { JobRow, useSeconds } from './LoadingPanel';

// A background Search (lib/research/backgroundRun.js) as the page shows it.
// `run` = the run as last heard: { state: 'running' | 'done' | 'stopped',
// label, jobs, results, startedAt, finishedAt, error }.
//   RunModal  the window: one line per entry with what it is doing, then
//             how it ended. Closing it never stops the run.
//   RunStrip  a slim line above the tabs while it runs and the window is
//             closed, with Show to open the window again.

const FINISHED = ['done', 'cached', 'failed'];
const time = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`);

function useElapsed(run) {
  const live = useSeconds(run?.state === 'running' ? run.startedAt : null);
  if (!run) return 0;
  if (run.state === 'running') return live;
  return Math.max(0, Math.round(((run.finishedAt || run.startedAt) - run.startedAt) / 1000));
}

export function RunModal({ run, open, onClose }) {
  const seconds = useElapsed(run);
  if (!run || !open) return null;
  const running = run.state === 'running';
  const jobs = run.jobs || [];
  const finished = jobs.filter((j) => FINISHED.includes(j.state)).length;
  const read = (run.results || []).filter((r) => r.products).length;

  let head;
  if (running) head = <><Loader2 size={16} className="animate-spin text-accent" /> Reading {jobs.length} {jobs.length === 1 ? 'entry' : 'entries'} · {finished} of {jobs.length} finished</>;
  else if (run.state === 'done') head = read === jobs.length
    ? <><CheckCircle2 size={16} className="text-[color:var(--move-up)]" /> Finished — all {jobs.length} read</>
    : <><XCircle size={16} className="text-[color:var(--move-down)]" /> Finished — {read} of {jobs.length} read</>;
  else head = <><XCircle size={16} className="text-[color:var(--move-down)]" /> Stopped before finishing</>;

  return (
    <Modal
      open
      onClose={onClose}
      title={running ? `Searching ${run.label}` : 'Search'}
      maxWidth="max-w-xl"
      footer={(
        <button type="button" onClick={onClose} className="ml-auto rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover">
          {running ? 'Run in background' : 'Close'}
        </button>
      )}
    >
      <div className="flex flex-col gap-3" role="status" aria-live="polite">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          {head}
          <span className="ml-auto text-xs font-normal tabular-nums text-subtle">{time(seconds)}</span>
        </p>
        <ul className="flex flex-col gap-2.5">{jobs.map((j) => <JobRow key={j.id} job={j} showName />)}</ul>
        {running ? (
          <p className="rounded-lg bg-card px-3 py-2 text-xs text-muted">
            This runs on the server. You can close this window or even leave the page — every entry’s products are saved as soon as it’s read, and the table updates by itself when it’s done. Each page takes a few seconds to half a minute (Meesho longer).
          </p>
        ) : run.state === 'stopped' ? (
          <p className="text-xs text-muted">{run.error}</p>
        ) : read < jobs.length ? (
          <p className="text-xs text-muted">What was read is saved. The ones that failed can be read again: tick them (or press “Tick … that failed”) and press Search.</p>
        ) : null}
      </div>
    </Modal>
  );
}

export function RunStrip({ run, onShow }) {
  const seconds = useElapsed(run);
  if (!run || run.state !== 'running') return null;
  const jobs = run.jobs || [];
  const finished = jobs.filter((j) => FINISHED.includes(j.state)).length;
  const active = jobs.find((j) => j.state === 'reading');
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-link/20 bg-link/5 px-3 py-1.5 text-xs text-foreground" role="status" aria-live="polite">
      <Loader2 size={13} className="animate-spin text-link" />
      <span className="font-semibold">Searching {run.label} in the background</span>
      <span className="text-muted">{finished} of {jobs.length} finished{active ? ` · ${active.label}: page ${active.page || 1}${active.want ? `, ${active.products || 0} of ${active.want}` : ''}` : ''}</span>
      <span className="ml-auto tabular-nums text-subtle">{time(seconds)}</span>
      <button type="button" onClick={onShow} className="inline-flex items-center gap-1 rounded-full border border-link/30 px-2.5 py-0.5 font-semibold text-link hover:bg-link/10">
        <Eye size={12} /> Show
      </button>
    </div>
  );
}
