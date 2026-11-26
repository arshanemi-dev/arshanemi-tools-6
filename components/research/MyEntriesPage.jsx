'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Layers, Loader2, Lock, LogIn, Minus, Plus, Unlock, X } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import { redirectToLogin } from '@/lib/authGate';
import { useMyEntries } from '@/lib/research/useMyEntries';
import { marketplaceById, marketplaceName, rangeLabel } from '@/data/marketplaces';
import ResearchTable from './ResearchTable';
import PlatformBadge from './PlatformBadge';
import { Skeleton } from './LoadingPanel';

const BTN = 'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors disabled:opacity-40';

// My Entries (/product-research/my-entries) — every signed-in user, for
// their own list. Every entry the master admin added, in a table (market
// place, category, pages, unlocked or not, saved or not) with Add / Remove
// on each row — or tick several and Add ticked / Remove ticked. The saved
// ones show as chips on top (× removes). Product Research's Entries ▾ lists
// only these (pick several there to see them together). Saving is free and
// doesn't unlock anything.
export default function MyEntriesPage({ signedIn }) {
  const { addToast } = useToast();
  const m = useMyEntries({ signedIn, addToast });
  const [ticked, setTicked] = useState(() => new Set());

  const mineSet = useMemo(() => new Set(m.mine), [m.mine]);
  const rows = useMemo(() => m.entries.map((e) => ({ ...e, key: e.id, title: e.name })), [m.entries]);
  const saved = useMemo(() => m.mine.map((id) => m.entries.find((e) => e.id === id)).filter(Boolean), [m.mine, m.entries]);
  const tickedIds = [...ticked].filter((id) => rows.some((r) => r.key === id));
  const toAdd = tickedIds.filter((id) => !mineSet.has(id));
  const toRemove = tickedIds.filter((id) => mineSet.has(id));
  const busyAny = m.busy.size > 0;

  const run = async (change) => {
    if (await m.change(change)) setTicked(new Set());
  };

  const columns = [
    {
      key: 'name', label: 'Name', value: (r) => r.name, text: (r) => r.name,
      render: (r) => <span className="font-semibold text-foreground">{r.name}</span>,
    },
    {
      key: 'platform', label: 'Market Place', value: (r) => marketplaceName(r.platform), text: (r) => (r.platform === 'mixed' ? 'Imported' : marketplaceName(r.platform)),
      render: (r) => (r.platform === 'mixed' ? <span className="text-xs text-muted">Imported</span> : <PlatformBadge platform={r.platform} />),
    },
    { key: 'category', label: 'Category', value: (r) => r.category, text: (r) => r.category },
    {
      key: 'pages', label: 'Pages', value: (r) => (r.kind === 'import' ? '' : rangeLabel(r)), text: (r) => (r.kind === 'import' ? 'imported sheet' : rangeLabel(r)),
      tone: () => 'text-muted',
    },
    {
      key: 'access', label: 'Access', description: 'Unlocked = you can see its data. A locked one is unlocked on Product Research (your first unlock is free).',
      value: (r) => (r.locked ? 'Locked' : 'Unlocked'), text: (r) => (r.locked ? 'Locked' : 'Unlocked'),
      render: (r) => (r.locked
        ? <span className="inline-flex items-center gap-1 text-xs text-subtle"><Lock size={12} /> Locked</span>
        : <span className="inline-flex items-center gap-1 text-xs text-foreground"><Unlock size={12} className="text-[color:var(--move-up)]" /> Unlocked</span>),
    },
    {
      key: 'mine', label: 'My List', description: 'Saved = it shows in the Entries dropdown on Product Research.',
      value: (r) => (mineSet.has(r.id) ? 'Saved' : 'Not saved'), text: (r) => (mineSet.has(r.id) ? 'Saved' : 'Not saved'),
      render: (r) => (mineSet.has(r.id)
        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--move-up)]"><CheckCircle2 size={13} /> Saved</span>
        : <span className="text-xs text-subtle">Not saved</span>),
    },
    {
      key: 'action', label: 'Action', value: () => '', text: () => '',
      render: (r) => {
        const busy = m.busy.has(r.id);
        return mineSet.has(r.id) ? (
          <button type="button" onClick={() => m.change({ remove: [r.id] })} disabled={busy} className={`${BTN} border border-neg/30 text-neg hover:bg-neg/10`}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Minus size={12} />} Remove
          </button>
        ) : (
          <button type="button" onClick={() => m.change({ add: [r.id] })} disabled={busy} className={`${BTN} bg-action text-white hover:bg-action-hover`}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
          </button>
        );
      },
    },
  ];

  let body;
  if (!signedIn) {
    body = (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-divider bg-background p-6 text-center">
        <Layers size={24} className="text-accent" />
        <h1 className="text-lg font-semibold text-foreground">Sign in to save your entries</h1>
        <p className="text-sm text-muted">Pick the entries you work with — Product Research then lists just those.</p>
        <button type="button" onClick={redirectToLogin} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-hover">
          <LogIn size={15} /> Log in
        </button>
      </div>
    );
  } else if (m.state === 'loading') {
    body = <Skeleton />;
  } else if (m.state === 'error') {
    body = (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-divider bg-background p-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">The entries couldn’t load</h1>
        <button type="button" onClick={m.reload} className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover">Try again</button>
      </div>
    );
  } else {
    body = (
      <>
        {/* My list — the saved ones, × removes */}
        <section className="flex flex-col gap-2 rounded-xl border border-divider bg-background p-3">
          <h2 className="text-sm font-semibold text-foreground">My list <span className="font-normal text-subtle">({saved.length})</span></h2>
          {saved.length ? (
            <div className="flex flex-wrap gap-1.5">
              {saved.map((e) => {
                const busy = m.busy.has(e.id);
                return (
                  <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full border border-divider-light bg-card py-0.5 pl-2.5 pr-1 text-sm text-foreground">
                    {marketplaceById(e.platform) && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: marketplaceById(e.platform).color }} aria-hidden />}
                    {e.name}
                    {e.locked && <Lock size={11} className="text-subtle" aria-label="locked" />}
                    <button type="button" onClick={() => m.change({ remove: [e.id] })} disabled={busy} aria-label={`Remove ${e.name}`} title="Remove from my list" className="flex h-5 w-5 items-center justify-center rounded-full text-subtle hover:bg-neg/10 hover:text-neg disabled:opacity-40">
                      {busy ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                    </button>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted">Nothing saved yet — press Add on the entries below. Product Research’s Entries list shows only the ones saved here.</p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!toAdd.length || busyAny} onClick={() => run({ add: toAdd })} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-action px-4 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-40" title={toAdd.length ? `Save the ${toAdd.length} ticked to my list` : 'Tick entries that aren’t saved yet'}>
              <Plus size={15} /> Add ticked{toAdd.length ? ` (${toAdd.length})` : ''}
            </button>
            <button type="button" disabled={!toRemove.length || busyAny} onClick={() => run({ remove: toRemove })} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neg/40 px-3 text-sm font-semibold text-neg hover:bg-neg/10 disabled:opacity-40" title={toRemove.length ? `Take the ${toRemove.length} ticked off my list` : 'Tick saved entries to remove them'}>
              <Minus size={14} /> Remove ticked{toRemove.length ? ` (${toRemove.length})` : ''}
            </button>
            <span className="ml-auto text-xs text-muted">{rows.length} {rows.length === 1 ? 'entry' : 'entries'} · {saved.length} saved</span>
          </div>
          <ResearchTable
            columns={columns}
            rows={rows}
            defaultSort={{ key: 'name', dir: 'asc' }}
            emptyText="No entries yet — they appear here once the master admin adds them."
            selectedKeys={new Set(tickedIds)}
            onToggleRow={(id) => setTicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
            onToggleAll={(ids) => setTicked((cur) => (ids.every((id) => cur.has(id)) ? new Set([...cur].filter((id) => !ids.includes(id))) : new Set([...cur, ...ids])))}
            tickPurpose="to add or remove"
            tickedSummary="ticked"
          />
        </section>
      </>
    );
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex w-full flex-col gap-4 px-4 py-5 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground"><Layers size={20} className="text-accent" /> My Entries</h1>
            <p className="text-xs text-muted">Save the entries you work with. The Entries dropdown on Product Research lists only these, and you can tick several there to see them together.</p>
          </div>
          <Link href="/product-research" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-divider-light px-3 text-sm font-semibold text-foreground hover:bg-card-hover">
            <ArrowLeft size={14} /> Product Research
          </Link>
        </div>
        {body}
      </div>
    </main>
  );
}
