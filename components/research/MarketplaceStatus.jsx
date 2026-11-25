'use client';

import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { marketplaceName, pageRange, rangeLabel } from '@/data/marketplaces';
import { fmtDay } from '@/lib/research/format';
import { todayIST } from '@/lib/research/time';

// One line per marketplace of the open search: how many products it holds
// and when it was last read — with the reason when today's read failed
// (icon + words, never colour alone). For a search whose page range starts
// after page 1 it also says how the ranks were counted.
export default function MarketplaceStatus({ search, status = [], notice = [], refreshing }) {
  const today = todayIST();
  const range = search && search.kind !== 'import' ? pageRange(search) : null;
  const counted = range && range.fromPage > 1 ? status.filter((s) => s.rankOffset > 0) : [];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {range && <span className="rounded-full bg-card px-2 py-0.5 font-semibold text-foreground">Reading {rangeLabel(range)}</span>}
        {status.map((s) => {
          const fresh = s.lastRunDate === today;
          const failed = s.lastRun?.error && s.lastRun.date === today && !s.lastRun.count;
          return (
            <span key={s.id || s.platform} className="inline-flex items-center gap-1" title={s.lastRun?.error || s.label || ''}>
              {failed ? <AlertTriangle size={13} className="text-[color:var(--move-down)]" /> : <CheckCircle2 size={13} className={fresh ? 'text-[color:var(--move-up)]' : 'text-subtle'} />}
              <span className="font-semibold text-foreground">{s.platform === 'mixed' ? 'Imported' : s.label || marketplaceName(s.platform)}</span>
              {s.products} products · {fresh ? 'updated today' : s.lastRunDate ? `last read ${fmtDay(s.lastRunDate)}` : 'not read yet'}
            </span>
          );
        })}
        {refreshing && <span className="inline-flex items-center gap-1 text-link"><Loader2 size={13} className="animate-spin" /> Reading today’s results…</span>}
      </div>
      {counted.length > 0 && (
        <p className="text-[11px] text-subtle">
          Pages 1–{range.fromPage - 1} aren’t read for this search, so their products are counted as full pages before the rank starts:{' '}
          {counted.map((s) => `${marketplaceName(s.platform)} ${s.perPage} a page → ranks start at #${s.rankOffset + 1}`).join(' · ')}.
        </p>
      )}
      {notice.length > 0 && (
        <div className="rounded-lg border border-[color:var(--move-down)]/30 bg-[color:var(--move-down)]/5 px-3 py-2 text-xs text-foreground">
          <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={13} /> Some market places couldn’t be read this time</p>
          <ul className="mt-1 list-disc pl-5 text-muted">{notice.map((n) => <li key={n}>{n}</li>)}</ul>
          <p className="mt-1 text-subtle">What was read is shown; tracked searches are read again automatically every day.</p>
        </div>
      )}
    </div>
  );
}
