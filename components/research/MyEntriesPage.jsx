'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Coins, Layers, LogIn, Minus, Plus, RefreshCw, X } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import { redirectToLogin } from '@/lib/authGate';
import { useMyEntries } from '@/lib/research/useMyEntries';
import { marketplaceById, marketplaceName } from '@/data/marketplaces';
import ResearchTable from './ResearchTable';
import PlatformBadge from './PlatformBadge';
import { Skeleton } from './LoadingPanel';
import EntryBillingModals, { coinsText, longDay } from './EntryBillingModals';

// Product Categories (/product-research/my-entries) — login required; every
// user's own list, paid a month at a time per entry (data/billing.js):
//   Add      a month is charged (confirm window → "Coins used" window); it
//            renews by itself every month
//   Remove   stops the renewals — the month already paid isn't refunded
//   Renew    an Expired one (its renewal found too few coins)
// Every entry the master admin added is in the table (name, market place,
// category) — tick several and Add / Remove / Renew ticked. The saved
// ones show as chips on top (× removes). Product Research's Entries ▾ lists
// only these.
export default function MyEntriesPage({ signedIn }) {
  const { addToast } = useToast();
  const m = useMyEntries({ signedIn, addToast });
  const b = m.billing;
  const [ticked, setTicked] = useState(() => new Set());

  const mineSet = useMemo(() => new Set(m.mine), [m.mine]);
  const rows = useMemo(() => m.entries.map((e) => ({ ...e, key: e.id, title: e.name })), [m.entries]);
  const saved = useMemo(() => m.mine.map((id) => m.entries.find((e) => e.id === id)).filter(Boolean), [m.mine, m.entries]);
  const tickedRows = rows.filter((r) => ticked.has(r.key));
  const toAdd = tickedRows.filter((r) => !mineSet.has(r.id));
  const toRemove = tickedRows.filter((r) => mineSet.has(r.id));
  const toRenew = tickedRows.filter((r) => r.status === 'expired');
  const payCount = toAdd.filter((r) => r.status !== 'active').length;
  const expiredCount = saved.filter((e) => e.status === 'expired').length;
  const clearTicks = () => setTicked(new Set());

  const planText = (r) => {
    if (m.isAdmin) return 'Free (master admin)';
    if (r.status === 'active') return `Paid till ${longDay(r.paidUntil)}${r.autoRenew ? ' · renews' : ' · not renewing'}`;
    if (r.status === 'expired') return `Expired ${longDay(r.paidUntil)}`;
    return 'Not added';
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
  ];

  let body;
  if (!signedIn) {
    body = (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-divider bg-background p-6 text-center">
        <Layers size={24} className="text-accent" />
        <h1 className="text-lg font-semibold text-foreground">Log in to add your entries</h1>
        <p className="text-sm text-muted">Product Research needs an account — each entry is paid a month at a time from your coins.</p>
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
        {/* The price, the way every paid tool says it */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <Coins size={13} className="text-accent" />
          {m.isAdmin
            ? 'Free for you (master admin).'
            : m.price
              ? <><strong className="text-foreground">{coinsText(m.price)}</strong> per entry / month — charged when you add it, then renewed every month from your wallet. Remove it to stop; months already paid aren’t refunded.</>
              : 'Entries are free right now.'}
          {expiredCount > 0 && <span className="font-semibold text-[color:var(--move-down)]">· {expiredCount} expired — renew to see {expiredCount === 1 ? 'it' : 'them'} again</span>}
        </p>

        {/* My list — the saved ones, × removes */}
        <section className="flex flex-col gap-2 rounded-xl border border-divider bg-background p-3">
          <h2 className="text-sm font-semibold text-foreground">My list <span className="font-normal text-subtle">({saved.length})</span></h2>
          {saved.length ? (
            <div className="flex flex-wrap gap-1.5">
              {saved.map((e) => (
                <span key={e.id} className={`inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-2.5 pr-1 text-sm text-foreground ${e.status === 'expired' ? 'border-[color:var(--move-down)]/40 bg-[color:var(--move-down)]/5' : 'border-divider-light bg-card'}`} title={planText(e)}>
                  {marketplaceById(e.platform) && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: marketplaceById(e.platform).color }} aria-hidden />}
                  {e.name}
                  {e.status === 'expired' && <span className="text-[10px] font-semibold text-[color:var(--move-down)]">Expired</span>}
                  <button type="button" onClick={() => b.askRemove([e])} disabled={b.busy} aria-label={`Remove ${e.name}`} title="Remove from my list" className="flex h-5 w-5 items-center justify-center rounded-full text-subtle hover:bg-neg/10 hover:text-neg disabled:opacity-40">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">Nothing added yet — tick entries below and press Add ticked. Product Research’s Entries list shows only the ones added here.</p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!toAdd.length || b.busy} onClick={() => { b.askAdd(toAdd); clearTicks(); }} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-action px-4 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-40" title={toAdd.length ? `Add the ${toAdd.length} ticked to my list` : 'Tick entries that aren’t on your list'}>
              <Plus size={15} /> Add ticked{toAdd.length ? ` (${toAdd.length}${payCount && m.price ? ` · ${coinsText(payCount * m.price)}` : ''})` : ''}
            </button>
            {toRenew.length > 0 && (
              <button type="button" disabled={b.busy} onClick={() => { b.askRenew(toRenew); clearTicks(); }} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-40">
                <RefreshCw size={14} /> Renew ticked ({toRenew.length}{m.price ? ` · ${coinsText(toRenew.length * m.price)}` : ''})
              </button>
            )}
            <button type="button" disabled={!toRemove.length || b.busy} onClick={() => { b.askRemove(toRemove); clearTicks(); }} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neg/40 px-3 text-sm font-semibold text-neg hover:bg-neg/10 disabled:opacity-40" title={toRemove.length ? `Take the ${toRemove.length} ticked off my list` : 'Tick entries on your list to remove them'}>
              <Minus size={14} /> Remove ticked{toRemove.length ? ` (${toRemove.length})` : ''}
            </button>
            <span className="ml-auto text-xs text-muted">{rows.length} {rows.length === 1 ? 'entry' : 'entries'} · {saved.length} on my list</span>
          </div>
          <ResearchTable
            columns={columns}
            rows={rows}
            defaultSort={{ key: 'name', dir: 'asc' }}
            emptyText="No entries yet — they appear here once the master admin adds them."
            selectedKeys={new Set(tickedRows.map((r) => r.key))}
            onToggleRow={(id) => setTicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
            onToggleAll={(ids) => setTicked((cur) => (ids.every((id) => cur.has(id)) ? new Set([...cur].filter((id) => !ids.includes(id))) : new Set([...cur, ...ids])))}
            tickPurpose="to add, renew or remove"
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
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground"><Layers size={20} className="text-accent" /> Product Categories</h1>
            <p className="text-xs text-muted">Add the entries you work with. The Entries dropdown on Product Research lists only these, and you can tick several there to see them together.</p>
          </div>
          <Link href="/product-research" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-divider-light px-3 text-sm font-semibold text-foreground hover:bg-card-hover">
            <ArrowLeft size={14} /> Product Research
          </Link>
        </div>
        {body}
      </div>
      <EntryBillingModals b={b} />
    </main>
  );
}
