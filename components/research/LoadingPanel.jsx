'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CircleDashed, FileSpreadsheet, Loader2, XCircle } from 'lucide-react';
import PlatformBadge from './PlatformBadge';

// What the page shows while data is still coming in — never a "no data"
// page. `progress` = useResearch's live progress ({ kind, label, startedAt,
// jobs }): one row per marketplace (or pasted link) with what it is doing
// right now, filled from the route's stream. Icon + words for every state,
// never colour alone. `skeleton` adds grey placeholders where the cards,
// graph and table will appear. `compact` = one slim strip above data that is
// already on screen (a refresh of a search that has older days).
const TITLE = {
  search: (l) => `Searching ${l ? `“${l}”` : ''}`,
  refresh: () => 'Reading today’s results',
  import: (l) => `Reading your sheet ${l ? `“${l}”` : ''}`,
  open: () => 'Opening your search',
  list: () => 'Loading your searches',
};

export function useSeconds(since) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since ? Math.max(0, Math.round((now - since) / 1000)) : 0;
}

// One job's line. `showName` = always write its name (an entry's, e.g.
// "meesho_blouse"), not only a pasted link's.
export function JobRow({ job, showName = false }) {
  const n = job.products || 0;
  const products = `${n} product${n === 1 ? '' : 's'}`;
  let icon;
  let text;
  if (job.state === 'reading') {
    icon = <Loader2 size={15} className="animate-spin text-link" />;
    text = !job.page ? 'Opening the first page…'
      : job.want ? `Page ${job.page} read${job.added != null ? ` (+${job.added} new)` : ''} · ${n} of ${job.want} products`
        : `Page ${job.page} of ${job.pages} read${job.added != null ? ` (+${job.added} new)` : ''} · ${products} so far`;
  } else if (job.state === 'done') {
    icon = <CheckCircle2 size={15} className="text-[color:var(--move-up)]" />;
    text = `Done · ${products}`;
  } else if (job.state === 'cached') {
    icon = <CheckCircle2 size={15} className="text-[color:var(--move-up)]" />;
    text = `Already read today · ${products}`;
  } else if (job.state === 'failed') {
    icon = <XCircle size={15} className="text-[color:var(--move-down)]" />;
    text = `Couldn’t read it${job.error ? ` — ${job.error}` : ''}`;
  } else {
    icon = <CircleDashed size={15} className="text-subtle" />;
    text = 'Waiting…';
  }
  const pct = job.state === 'reading'
    ? job.want ? Math.min(100, Math.round((n / job.want) * 100)) : job.pages ? Math.round((job.page / job.pages) * 100) : 0
    : ['done', 'cached', 'failed'].includes(job.state) ? 100 : 0;
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <PlatformBadge platform={job.platform} />
        {/* A link job's own name ("Flipkart · women kurtas" → "women kurtas"); a keyword job's would only repeat the badge. */}
        {showName && job.label && !job.label.includes(' · ') && <span className="min-w-0 truncate text-xs font-semibold text-foreground" title={job.label}>{job.label}</span>}
        {job.label?.includes(' · ') && <span className="min-w-0 truncate text-xs text-muted" title={job.label}>{job.label.split(' · ').slice(1).join(' · ')}</span>}
        <span className="ml-auto min-w-0 truncate text-xs text-muted" title={text}>{text}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-card" aria-hidden>
        <div className={`h-full rounded-full transition-all duration-500 ${job.state === 'failed' ? 'bg-[color:var(--move-down)]' : 'bg-action'}`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

export function Skeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-[5.5rem] animate-pulse rounded-2xl bg-card" />)}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-card" />
      <div className="overflow-hidden rounded-xl border border-divider">
        <div className="h-10 bg-[#1565C0]/70" />
        {Array.from({ length: 6 }, (_, i) => <div key={i} className={`h-11 animate-pulse ${i % 2 ? 'bg-card' : 'bg-background'}`} />)}
      </div>
    </div>
  );
}

export default function LoadingPanel({ progress, kind = progress?.kind || 'open', label = progress?.label, skeleton = true, compact = false }) {
  const seconds = useSeconds(progress?.startedAt);
  const jobs = progress?.jobs || [];
  const finished = jobs.filter((j) => ['done', 'cached', 'failed'].includes(j.state)).length;
  const title = (TITLE[kind] || TITLE.open)(label);

  if (compact) {
    const active = jobs.find((j) => j.state === 'reading');
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-link/20 bg-link/5 px-3 py-1.5 text-xs text-foreground" role="status" aria-live="polite">
        <Loader2 size={13} className="animate-spin text-link" />
        <span className="font-semibold">{title}</span>
        {jobs.length > 0 && <span className="text-muted">{finished} of {jobs.length} done{active ? ` · ${active.label} page ${active.page || 1}` : ''}</span>}
        <span className="ml-auto tabular-nums text-subtle">{seconds}s</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-divider bg-background p-4" role="status" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2">
          {kind === 'import' ? <FileSpreadsheet size={18} className="text-accent" /> : <Loader2 size={18} className="animate-spin text-accent" />}
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {jobs.length > 0 && <span className="text-xs text-muted">{finished} of {jobs.length} finished</span>}
          {progress?.startedAt && <span className="ml-auto text-xs tabular-nums text-subtle">{seconds}s</span>}
        </div>
        {jobs.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2.5">{jobs.map((j) => <JobRow key={j.id} job={j} />)}</ul>
        ) : (
          <p className="mt-2 text-xs text-muted">{kind === 'search' || kind === 'refresh' ? 'Getting ready…' : 'One moment…'}</p>
        )}
        {(kind === 'search' || kind === 'refresh') && (
          <p className="mt-3 text-[11px] text-subtle">
            Each page is read through a scraping service — a few seconds to half a minute a page. Keep this tab open; the results show as soon as every market place is done.
          </p>
        )}
      </section>
      {skeleton && <Skeleton />}
    </div>
  );
}
