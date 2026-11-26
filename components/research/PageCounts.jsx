'use client';

import { TriangleAlert } from 'lucide-react';
import { pageStates } from '@/lib/research/pageCounts';
import { fmtDay, fmtInt } from '@/lib/research/format';

// The "Products / Page" cell of the New Search table: how each page of an
// entry's last Search went — one chip per page, then the total.
//   p1 48 · p2 52 · p3 57 = 157       the new products each page added
//   p2 12 ⚠                            cut short (lib/research/pageCounts.js)
//   p3 ended · p2 ✕ · p3 –             results ran out · couldn't be read · not read
// Hover a chip for listed / new / repeats / ads. `entry` = an entry with
// stats (lib/research/cleanup.js entryStats); `range` = the shared
// { fromPage, toPage } the next Search reads.

const CHIP = 'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums';
const LOOK = {
  ok: `${CHIP} bg-card text-foreground`,
  short: `${CHIP} bg-[color:var(--status-warn)]/10 font-semibold text-[color:var(--status-warn)]`,
  ended: `${CHIP} border border-dashed border-divider text-subtle`,
  empty: `${CHIP} bg-[color:var(--move-down)]/10 font-semibold text-[color:var(--move-down)]`,
  failed: `${CHIP} bg-[color:var(--move-down)]/10 font-semibold text-[color:var(--move-down)]`,
  skipped: `${CHIP} border border-dashed border-divider text-subtle`,
};

function detail(p) {
  const bits = [`${p.shown} listed`, `${p.added} new`];
  if (p.repeats) bits.push(`${p.repeats} already on an earlier page`);
  if (p.ads) bits.push(`${p.ads} ads`);
  return `Page ${p.page}: ${bits.join(' · ')}`;
}

function titleOf(p, s, entry) {
  switch (p.state) {
    case 'ok': return detail(p);
    case 'short': return `${detail(p)}. That's under half of the fullest page (${s.fullest} listed), yet a later page still had new products — this page probably didn't load fully. Search again to read it again.`;
    case 'ended': return p.shown
      ? `Page ${p.page} listed ${p.shown}, all already on an earlier page — the results end here${entry.url ? ' (or this link shows the same products whatever the page number)' : ''}.`
      : `Page ${p.page} listed nothing — the results end before it.`;
    case 'empty': return `Page ${p.page}: no products could be read${entry.countedError ? ` — ${entry.countedError}` : ''}.`;
    case 'failed': return `Page ${p.page} couldn't be read${entry.countedError ? ` — ${entry.countedError}` : ''}. Reading stopped here.`;
    default: return s.stoppedAt ? `Page ${p.page} wasn't read — reading stopped at page ${s.stoppedAt}.` : `Page ${p.page} wasn't read.`;
  }
}

function label(p) {
  if (p.state === 'ok') return <><span className="text-subtle">p{p.page}</span> <span className="font-semibold">{fmtInt(p.added)}</span></>;
  if (p.state === 'short') return <>p{p.page} {fmtInt(p.added)} <TriangleAlert size={10} aria-hidden /></>;
  if (p.state === 'ended') return <>p{p.page} ended</>;
  if (p.state === 'empty') return <>p{p.page} 0</>;
  if (p.state === 'failed') return <>p{p.page} ✕</>;
  return <>p{p.page} –</>;
}

export default function PageCounts({ entry, range }) {
  if (entry.kind === 'import') return <span className="text-xs text-subtle">-</span>;
  const s = pageStates(entry);
  if (!s) {
    return <span className="text-xs text-subtle">{entry.lastRead ? 'read before page counts — Search again' : 'not read yet — Search fills this in'}</span>;
  }
  // The Search stopped before its first page (e.g. a scraping key missing).
  if (s.pages.every((p) => p.state === 'skipped')) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[color:var(--move-down)]" title={entry.countedError || ''}>
        <TriangleAlert size={12} aria-hidden /> last Search read no page{entry.countedError ? ' — hover for why' : ''}
      </span>
    );
  }
  const sameRange = !range || (s.fromPage === range.fromPage && s.toPage === range.toPage);

  return (
    <div className="flex flex-col items-start gap-0.5 text-left">
      <div className="flex flex-wrap items-center gap-1">
        {s.pages.map((p) => (
          <span key={p.page} title={titleOf(p, s, entry)} className={LOOK[p.state]}>{label(p)}</span>
        ))}
        <span className="text-[11px] font-semibold tabular-nums text-foreground" title={`Products the last Search found${entry.countedAt ? ` (${fmtDay(entry.countedAt)})` : ''}`}>= {fmtInt(s.total)}</span>
      </div>
      {!sameRange && (
        <span className="text-[10.5px] text-subtle">read with pages {s.fromPage}–{s.toPage} · the next Search reads {range.fromPage}–{range.toPage}</span>
      )}
    </div>
  );
}
