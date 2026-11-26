'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileSpreadsheet, Link2, LogIn, Settings, Tags, Trash2 } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { redirectToLogin } from '@/lib/authGate';
import { deleteSearchesBulk, getSettings } from '@/lib/research/apiClient';
import { fmtDay, fmtInt } from '@/lib/research/format';
import { marketplaceName, rangeLabel } from '@/data/marketplaces';
import ResearchTable from './ResearchTable';
import PlatformBadge from './PlatformBadge';
import { Skeleton } from './LoadingPanel';
import AdminDataPanel from './AdminDataPanel';

// Settings › My searches: every search the user tracks (and imported
// sheet), with what it holds; delete one, the ticked ones, or all. What
// deleting does (lib/research/cleanup.js): the search leaves the list; an
// imported sheet's data is deleted; a keyword / link nobody else tracks
// stops being read every day and its data is deleted; one someone else
// also tracks stays for them. Coins already used aren't refunded.
// The master admin also gets AdminDataPanel (all data, storage tools).

const KIND = {
  search: { label: 'Category', icon: Tags },
  url: { label: 'URL', icon: Link2 },
  import: { label: 'Import', icon: FileSpreadsheet },
};

function resultText(r) {
  const parts = [`${r.searches} search${r.searches === 1 ? '' : 'es'} deleted`];
  if (r.deletedData) parts.push(`saved data removed for ${r.deletedData}`);
  if (r.keptShared) parts.push(`${r.keptShared} kept for other users who track ${r.keptShared === 1 ? 'it' : 'them'}`);
  return parts.join(' · ');
}

export default function SettingsPage({ signedIn }) {
  const { addToast } = useToast();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(null);
  const [ticked, setTicked] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null); // { kind: 'one' | 'ticked' | 'all', search? }
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    const res = await getSettings();
    if (!res.ok) { setFailed(res.data?.error || 'Could not load your settings'); return; }
    setFailed(null);
    setData(res.data);
    setTicked((cur) => new Set([...cur].filter((id) => res.data.searches.some((s) => s.id === id))));
  }, []);

  useEffect(() => {
    if (!signedIn) return undefined;
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [signedIn, load]);

  const rows = useMemo(() => (data?.searches || []).map((s) => ({ ...s, key: s.id, title: s.query })), [data]);
  const columns = useMemo(() => [
    {
      key: 'kind', label: 'Type', value: (r) => KIND[r.kind || 'search']?.label, text: (r) => KIND[r.kind || 'search']?.label,
      render: (r) => {
        const k = KIND[r.kind || 'search'] || KIND.search;
        return <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-foreground"><k.icon size={12} /> {k.label}</span>;
      },
    },
    {
      key: 'query', label: 'Search', wrap: true, value: (r) => r.query, text: (r) => r.query,
      render: (r) => (
        <div className="max-w-[22rem] text-left">
          <p className="font-medium text-foreground">{r.query}</p>
          {r.kind === 'url' && (r.urls || []).map((u) => <p key={u} className="truncate text-[11px] text-subtle" title={u}>{u}</p>)}
        </div>
      ),
    },
    {
      key: 'platforms', label: 'Market Places', value: (r) => (r.platforms || []).map(marketplaceName).join(', '), text: (r) => (r.platforms || []).map(marketplaceName).join(', '),
      render: (r) => <div className="flex max-w-[16rem] flex-wrap justify-center gap-1">{(r.platforms || []).filter((p) => p !== 'other').map((p) => <PlatformBadge key={p} platform={p} />)}</div>,
    },
    { key: 'pages', label: 'Pages', value: (r) => (r.kind === 'import' ? null : rangeLabel(r)), text: (r) => (r.kind === 'import' ? '-' : rangeLabel(r)) },
    { key: 'products', label: 'Products', numeric: true, value: (r) => r.products, text: (r) => fmtInt(r.products), total: 'sum', totalFormat: fmtInt },
    { key: 'days', label: 'Days of History', numeric: true, value: (r) => r.days, text: (r) => fmtInt(r.days) },
    { key: 'lastRead', label: 'Last Read', value: (r) => r.lastRead, text: (r) => fmtDay(r.lastRead) },
    { key: 'createdAt', label: 'Added', value: (r) => r.createdAt, text: (r) => fmtDay(r.createdAt?.slice(0, 10)) },
    { key: 'coins', label: 'Coins Used', numeric: true, value: (r) => r.coinsCharged ?? 0, text: (r) => (r.kind === 'import' ? 'Free' : r.free ? 'Free' : fmtInt(r.coinsCharged ?? 0)), total: 'sum', totalFormat: fmtInt },
    {
      key: 'delete', label: 'Delete', value: () => '', text: () => '',
      render: (r) => (
        <button type="button" onClick={() => setConfirm({ kind: 'one', search: r })} className="inline-flex items-center gap-1 rounded-full border border-neg/30 px-3 py-1 text-xs font-semibold text-neg hover:bg-neg/10" aria-label={`Delete ${r.query}`}>
          <Trash2 size={13} /> Delete
        </button>
      ),
    },
  ], []);

  const run = async () => {
    const body = confirm.kind === 'all' ? { all: true } : { ids: confirm.kind === 'one' ? [confirm.search.id] : [...ticked] };
    setWorking(true);
    const res = await deleteSearchesBulk(body);
    setWorking(false);
    setConfirm(null);
    if (!res.ok) { addToast(res.data?.error || 'Could not delete — try again.', 'error'); return; }
    addToast(resultText(res.data));
    setTicked(new Set());
    load();
  };

  if (!signedIn) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-divider bg-background p-6 text-center">
          <Settings size={24} className="text-accent" />
          <h1 className="text-lg font-semibold text-foreground">Sign in to see your settings</h1>
          <p className="text-sm text-muted">Your searches and their data belong to your account.</p>
          <button type="button" onClick={redirectToLogin} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover">
            <LogIn size={14} /> Log in
          </button>
        </div>
      </main>
    );
  }

  const total = rows.length;
  const description = !confirm ? '' : confirm.kind === 'one'
    ? `“${confirm.search.query}” leaves your list. Its saved data is deleted too, unless someone else also tracks it. Coins already used aren’t refunded; searching it again later counts as a new search.`
    : confirm.kind === 'ticked'
      ? `${ticked.size} search${ticked.size === 1 ? '' : 'es'} leave your list. Their saved data is deleted too, except what other users also track. Coins already used aren’t refunded.`
      : `All ${total} of your searches and imported sheets leave your list, with their saved data (except what other users also track). This can’t be undone. Coins already used aren’t refunded.`;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex w-full flex-col gap-5 px-4 py-5 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/product-research" className="inline-flex items-center gap-1 rounded-full border border-divider-light px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-card-hover">
            <ArrowLeft size={15} /> Product Research
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground"><Settings size={20} className="text-accent" /> Settings</h1>
        </div>

        {failed ? (
          <div className="rounded-2xl border border-neg/30 bg-neg/5 p-4 text-sm text-foreground">
            {failed} — <button type="button" onClick={load} className="font-semibold text-link hover:underline">try again</button>
          </div>
        ) : !data ? (
          <Skeleton />
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-foreground">My searches</h2>
                  <p className="text-xs text-muted">
                    {total ? `${total} search${total === 1 ? '' : 'es'} · ${fmtInt(rows.reduce((n, r) => n + (r.products || 0), 0))} products saved` : 'You have no searches yet.'}
                    {' '}· Deleting is permanent. Data other users also track stays for them.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={!ticked.size} onClick={() => setConfirm({ kind: 'ticked' })} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neg/40 px-3 text-sm font-semibold text-neg hover:bg-neg/10 disabled:opacity-40">
                    <Trash2 size={14} /> Delete ticked{ticked.size ? ` (${ticked.size})` : ''}
                  </button>
                  <button type="button" disabled={!total} onClick={() => setConfirm({ kind: 'all' })} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-neg px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40">
                    <Trash2 size={14} /> Delete all my searches
                  </button>
                </div>
              </div>
              <ResearchTable
                columns={columns}
                rows={rows}
                defaultSort={{ key: 'createdAt', dir: 'desc' }}
                emptyText="No searches yet — search a category or paste a link on the Product Research page."
                selectedKeys={ticked}
                onToggleRow={(id) => setTicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                onToggleAll={(ids) => setTicked((cur) => (ids.every((id) => cur.has(id)) ? new Set([...cur].filter((id) => !ids.includes(id))) : new Set([...cur, ...ids])))}
                tickPurpose="to delete"
                tickedSummary="ticked to delete"
              />
            </section>

            {data.isAdmin && <AdminDataPanel storage={data.storage} onChanged={load} />}
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === 'all' ? 'Delete all your searches?' : confirm?.kind === 'ticked' ? `Delete ${ticked.size} search${ticked.size === 1 ? '' : 'es'}?` : 'Delete this search?'}
        description={description}
        confirmText={confirm?.kind === 'all' ? 'DELETE' : undefined}
        confirmLabel="Delete"
        loadingLabel="Deleting…"
        loading={working}
        onCancel={() => setConfirm(null)}
        onConfirm={run}
      />
    </main>
  );
}
