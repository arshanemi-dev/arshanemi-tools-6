'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, FileSpreadsheet, Layers, Lock } from 'lucide-react';
import Popover from '@/components/dashboard/Popover';
import { ListSearchBox, matchesSearch } from '@/components/dashboard/SearchChecklist';
import { rangeLabel } from '@/data/marketplaces';
import { MAX_PICK } from '@/lib/research/myEntries';
import PlatformBadge from './PlatformBadge';

export const MY_ENTRIES_HREF = '/product-research/my-entries';

// "Entries ▾" — pick several. It lists ONLY the entries this user saved on
// My Entries: name, market place, pages, a lock on the ones not unlocked
// yet. Nothing is ticked at first. Search by name, market place or
// category; tick up to MAX_PICK; Show opens them together in Daily History
// (Show with none ticked clears it).
// `searches` = the listed entries, `picked` = the ticked ids, `onPick(ids)`.
export default function SearchPicker({ searches = [], picked = [], onPick }) {
  const chosen = searches.filter((s) => picked.includes(s.id));
  const lockedCount = chosen.filter((s) => s.locked).length;
  const text = !chosen.length ? `Pick entries (${searches.length})` : chosen.length === 1 ? chosen[0].name : `${chosen.length} entries`;

  return (
    <Popover
      align="left"
      panelClass="p-1"
      trigger={() => (
        <button type="button" disabled={!searches.length} title="Pick one or several entries to see together" className={`inline-flex h-9 items-center gap-1.5 rounded-full border bg-background px-3 text-sm font-medium text-foreground hover:border-divider disabled:opacity-45 ${chosen.length > 1 ? 'border-accent' : 'border-divider-light'}`}>
          <Layers size={15} className="text-muted" />
          <span className="max-w-[14rem] truncate">{text}</span>
          {lockedCount > 0 && <Lock size={12} className="text-subtle" aria-label={`${lockedCount} locked`} />}
          <ChevronDown size={13} className="text-muted" />
        </button>
      )}
    >
      {(close) => <PickList searches={searches} picked={picked} onPick={onPick} close={close} />}
    </Popover>
  );
}

function PickList({ searches, picked, onPick, close }) {
  const [q, setQ] = useState('');
  const [ticked, setTicked] = useState(() => picked.filter((id) => searches.some((s) => s.id === id)));
  const listed = searches.filter((s) => matchesSearch(`${s.name} ${s.platform} ${s.category}`, q));
  const full = ticked.length >= MAX_PICK;
  const allTicked = listed.length > 0 && listed.every((s) => ticked.includes(s.id));

  const toggle = (id) => setTicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_PICK ? cur : [...cur, id]));
  const toggleAll = () => setTicked((cur) => (allTicked
    ? cur.filter((id) => !listed.some((s) => s.id === id))
    : [...cur, ...listed.map((s) => s.id).filter((id) => !cur.includes(id))].slice(0, MAX_PICK)));
  const show = () => { onPick(ticked); close(); };
  // Enter in the search box with exactly one match: show just that one.
  const onEnter = () => { if (listed.length === 1) { onPick([listed[0].id]); close(); } else show(); };

  return (
    <div className="flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2 p-1 text-left">
      <ListSearchBox value={q} onChange={setQ} onEnter={onEnter} placeholder="Search entries…" label="Search entries" />
      <div className="max-h-80 overflow-y-auto rounded-lg border border-divider p-1">
        {!listed.length ? (
          <p className="px-2.5 py-3 text-center text-xs text-subtle">Nothing matches.</p>
        ) : (
          <>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border-b border-divider px-2 py-1 text-[13px] font-medium text-foreground hover:bg-card-hover">
              <input type="checkbox" checked={allTicked} onChange={toggleAll} className="shrink-0 accent-[var(--color-action)]" />
              {q.trim() ? '(Select All Search Results)' : '(Select All)'}
              {listed.length > MAX_PICK && <span className="ml-auto text-[11px] font-normal text-subtle">first {MAX_PICK}</span>}
            </label>
            {listed.map((s) => {
              const on = ticked.includes(s.id);
              return (
                <label key={s.id} className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-card-hover ${on ? 'bg-card' : ''} ${!on && full ? 'opacity-50' : ''}`}>
                  <input type="checkbox" checked={on} disabled={!on && full} onChange={() => toggle(s.id)} className="mt-1 shrink-0 accent-[var(--color-action)]" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      {s.kind === 'import' && <FileSpreadsheet size={13} className="shrink-0 text-muted" />}
                      <span className="truncate">{s.name}</span>
                      {s.locked && <Lock size={12} className="shrink-0 text-subtle" aria-label="locked" />}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-subtle">
                      {s.platform && s.platform !== 'mixed' && <PlatformBadge platform={s.platform} />}
                      {s.kind === 'import' ? 'Imported sheet' : rangeLabel(s)}
                    </span>
                  </span>
                </label>
              );
            })}
          </>
        )}
      </div>
      {full && <p className="px-1 text-[11px] text-subtle">At most {MAX_PICK} entries at once.</p>}
      <div className="flex items-center gap-2">
        <Link href={MY_ENTRIES_HREF} className="text-[12px] font-semibold text-link hover:underline" title="Add or remove entries in this list">
          Manage my entries
        </Link>
        <span className="ml-auto text-[11px] text-subtle">{ticked.length} selected</span>
        <button type="button" onClick={close} className="rounded-lg border border-divider-light px-2.5 py-1 text-[12px] font-medium text-muted hover:bg-card-hover">Cancel</button>
        <button type="button" onClick={show} disabled={!ticked.length && !picked.length} className="rounded-lg bg-action px-3 py-1 text-[12px] font-semibold text-white hover:bg-action-hover disabled:opacity-40">Show</button>
      </div>
    </div>
  );
}
