'use client';

import { useState } from 'react';
import { ChevronDown, FileSpreadsheet, History, Link2, Trash2 } from 'lucide-react';
import Popover from '@/components/dashboard/Popover';
import { ListSearchBox, matchesSearch } from '@/components/dashboard/SearchChecklist';
import { marketplaceName, rangeLabel } from '@/data/marketplaces';
import { fmtDay } from '@/lib/research/format';

// "My Searches ▾" — every keyword the user tracks (and imported sheet),
// newest first; pick one to open it, bin icon to stop tracking it.
export default function SearchPicker({ searches = [], activeId, onPick, onDelete }) {
  const [q, setQ] = useState('');
  const active = searches.find((s) => s.id === activeId);
  const listed = searches.filter((s) => matchesSearch(`${s.query} ${s.platforms.join(' ')}`, q));

  return (
    <Popover
      align="left"
      panelClass="w-80 max-h-96 overflow-y-auto p-1"
      onOpenChange={(open) => { if (!open) setQ(''); }}
      trigger={() => (
        <button type="button" disabled={!searches.length} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-divider-light bg-background px-3 text-sm font-medium text-foreground hover:border-divider disabled:opacity-45">
          <History size={15} className="text-muted" />
          <span className="max-w-[12rem] truncate">{active ? active.query : `My Searches (${searches.length})`}</span>
          <ChevronDown size={13} className="text-muted" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="pb-1"><ListSearchBox value={q} onChange={setQ} placeholder="Search my searches…" label="Search my searches" /></div>
          {!listed.length && <p className="px-2.5 py-2 text-xs text-subtle">Nothing matches.</p>}
          {listed.map((s) => (
            <div key={s.id} className={`group flex items-start gap-2 rounded-lg px-2.5 py-1.5 hover:bg-card-hover ${s.id === activeId ? 'bg-card' : ''}`}>
              <button type="button" onClick={() => { onPick(s.id); close(); }} className="min-w-0 flex-1 text-left">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  {s.kind === 'import' && <FileSpreadsheet size={13} className="shrink-0 text-muted" />}
                  {s.kind === 'url' && <Link2 size={13} className="shrink-0 text-muted" />}
                  <span className="truncate">{s.query}</span>
                </span>
                <span className="block truncate text-[11px] text-subtle">
                  {s.kind === 'import' ? 'Imported sheet' : s.kind === 'url' ? `${(s.urls || []).length} link${(s.urls || []).length === 1 ? '' : 's'} · ${rangeLabel(s)}` : `${s.platforms.map(marketplaceName).join(', ')} · ${rangeLabel(s)}`} · since {fmtDay(s.createdAt?.slice(0, 10))}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(s)}
                className="mt-0.5 shrink-0 rounded p-1 text-subtle opacity-0 transition-opacity hover:bg-neg/10 hover:text-neg focus:opacity-100 group-hover:opacity-100"
                aria-label={`Stop tracking ${s.query}`}
                title="Stop tracking this search"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </>
      )}
    </Popover>
  );
}
