'use client';

import { useState } from 'react';
import { ChevronDown, FileSpreadsheet, Layers, Lock } from 'lucide-react';
import Popover from '@/components/dashboard/Popover';
import { ListSearchBox, matchesSearch } from '@/components/dashboard/SearchChecklist';
import { rangeLabel } from '@/data/marketplaces';
import PlatformBadge from './PlatformBadge';

// "Entries ▾" — every entry the master admin added ("flipkart_cotton-kurti"),
// with its market place and pages; a lock on the ones this user hasn't
// unlocked yet (opening one shows its Unlock card). Searchable by name,
// market place or category.
export default function SearchPicker({ searches = [], activeId, onPick }) {
  const [q, setQ] = useState('');
  const active = searches.find((s) => s.id === activeId);
  const listed = searches.filter((s) => matchesSearch(`${s.name} ${s.platform} ${s.category}`, q));

  return (
    <Popover
      align="left"
      panelClass="w-80 max-h-96 overflow-y-auto p-1"
      onOpenChange={(open) => { if (!open) setQ(''); }}
      trigger={() => (
        <button type="button" disabled={!searches.length} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-divider-light bg-background px-3 text-sm font-medium text-foreground hover:border-divider disabled:opacity-45">
          <Layers size={15} className="text-muted" />
          <span className="max-w-[14rem] truncate">{active ? active.name : `Entries (${searches.length})`}</span>
          {active?.locked && <Lock size={12} className="text-subtle" />}
          <ChevronDown size={13} className="text-muted" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="pb-1"><ListSearchBox value={q} onChange={setQ} placeholder="Search entries…" label="Search entries" /></div>
          {!listed.length && <p className="px-2.5 py-2 text-xs text-subtle">Nothing matches.</p>}
          {listed.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onPick(s.id); close(); }}
              className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-card-hover ${s.id === activeId ? 'bg-card' : ''}`}
            >
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
            </button>
          ))}
        </>
      )}
    </Popover>
  );
}
