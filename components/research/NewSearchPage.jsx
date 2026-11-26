'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, FileUp, Pencil, Plus, Save, Search, ShieldAlert, Trash2, TriangleAlert, X, XCircle } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { FileIconButton } from '@/components/dashboard/IconButton';
import { useAdminEntries } from '@/lib/research/useAdminEntries';
import { fmtDay, fmtInt } from '@/lib/research/format';
import { MARKETPLACES, marketplaceName, readListingUrl } from '@/data/marketplaces';
import { entryName } from '@/data/entryName';
import ResearchTable from './ResearchTable';
import PlatformBadge from './PlatformBadge';
import ToggleSwitch from './ToggleSwitch';
import ComboBox from './ComboBox';
import PageRangePicker from './PageRangePicker';
import PageCounts from './PageCounts';
import { hasPageProblem, pageCountsText, pageStates } from '@/lib/research/pageCounts';
import LoadingPanel, { Skeleton } from './LoadingPanel';
import EntryProductsView from './EntryProductsView';
import AdminDataPanel from './AdminDataPanel';

const NEW = '__new__';
const MARKET_OPTIONS = MARKETPLACES.map((m) => ({ value: m.id, label: m.name, color: m.color }));
const BTN = 'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors disabled:opacity-40';

// The New Search page (/product-research/new-search) — the master admin
// only. Nothing of it is drawn until the server has confirmed the role.
// Everything happens in the entries table:
//   [+ Add] [Pages From–To] [Search] [Delete ticked] … [Import Sheet]
//   + Add puts an editable row on top: Market place and Category are
//   searchable dropdowns (a new category: type it + Enter), the link, the
//   Daily switch, then Save / Close. Every row's Actions: Edit (the row turns
//   into the same inputs, Save / Close) and Delete. The Pages above are the
//   ONE range every entry is read with — by Search (the ticked rows) and by
//   the daily read (rows with Daily on). A name opens its products below.
export default function NewSearchPage({ signedIn }) {
  const { addToast } = useToast();
  const a = useAdminEntries({ signedIn, addToast });
  const [ticked, setTicked] = useState(() => new Set());
  const [shownId, setShownId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirm, setConfirm] = useState(null); // { ids, label }
  const [editing, setEditing] = useState(null); // { id (NEW or an entry id), platform, category, url, autoDaily }

  // The list, plus the category of the row being edited if it isn't in it.
  const editingCategory = editing?.category || '';
  const categoryOptions = useMemo(() => {
    const list = [...a.categories];
    if (editingCategory && !list.some((c) => c.toLowerCase() === editingCategory.toLowerCase())) list.push(editingCategory);
    return list.map((c) => ({ value: c, label: c }));
  }, [a.categories, editingCategory]);

  // The row being edited, checked as it is typed (the server checks again).
  const check = useMemo(() => {
    if (!editing) return null;
    const others = a.entries.filter((e) => e.id !== editing.id);
    const name = editing.platform && editing.category.trim().length >= 2 ? entryName(editing.platform, editing.category) : null;
    const nameTaken = !!name && others.some((e) => e.name === name);
    const link = editing.url.trim() ? readListingUrl(editing.url) : null;
    const linkError = link?.error || (link?.url && editing.platform && link.platform !== editing.platform ? `That’s a ${marketplaceName(link.platform)} link, not ${marketplaceName(editing.platform)}` : null);
    const before = a.entries.find((e) => e.id === editing.id);
    const newHistory = !!before && (before.platform !== editing.platform || before.category !== editing.category.trim() || (before.url || '') !== (link?.url || editing.url.trim()));
    return { name, nameTaken, linkError, ok: !!name && !nameTaken && !linkError, newHistory, url: link?.url || '' };
  }, [editing, a.entries]);

  const startAdd = () => { setEditing({ id: NEW, platform: null, category: '', url: '', autoDaily: true }); };
  const startEdit = (e) => setEditing({ id: e.id, platform: e.platform, category: e.category, url: e.url || '', autoDaily: e.autoDaily !== false });
  const set = (patch) => setEditing((cur) => ({ ...cur, ...patch }));
  const save = async () => {
    if (!check?.ok) return;
    const row = { platform: editing.platform, category: editing.category.trim(), url: check.url, autoDaily: editing.autoDaily };
    if (editing.id === NEW) {
      const made = await a.add(row);
      if (made) { setEditing(null); setTicked((cur) => new Set(cur).add(made.id)); setShownId(made.id); }
    } else {
      const saved = await a.update(editing.id, row);
      if (saved) { setEditing(null); setReloadKey((k) => k + 1); }
    }
  };

  const rows = useMemo(() => a.entries.map((e) => ({ ...e, key: e.id, title: e.name })), [a.entries]);
  const pinned = editing?.id === NEW ? [{ key: NEW, id: NEW, name: '', title: 'new entry' }] : [];
  const shown = a.entries.find((e) => e.id === shownId) || a.entries[0] || null;
  const tickedIds = [...ticked].filter((id) => a.entries.some((e) => e.id === id && e.kind !== 'import'));
  // Entries whose last Search had a page that failed or didn't load fully —
  // one click ticks just these, so Search reads again only what needs it.
  const needFix = useMemo(() => a.entries.filter((e) => e.kind !== 'import' && hasPageProblem(e)).map((e) => e.id), [a.entries]);
  const isEdit = (r) => editing?.id === r.key;

  const columns = [
    {
      key: 'name', label: 'Name', value: (r) => r.name, text: (r) => r.name,
      render: (r) => (isEdit(r) ? (
        <span className="inline-flex flex-col items-start gap-0.5 text-left">
          {check?.name ? <code className="rounded-md bg-card px-1.5 py-0.5 text-xs font-semibold text-foreground">{check.name}</code> : <span className="text-xs text-subtle">pick market place + category</span>}
          {check?.name && (check.nameTaken
            ? <span className="inline-flex items-center gap-1 text-[11px] text-neg"><XCircle size={12} /> already exists</span>
            : <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--move-up)]"><CheckCircle2 size={12} /> {editing.id === NEW ? 'new' : 'ok'}</span>)}
        </span>
      ) : (
        <button type="button" onClick={() => setShownId(r.id)} title="Show its products below" className={`font-semibold hover:underline ${r.id === shown?.id ? 'text-accent' : 'text-link'}`}>{r.name}</button>
      )),
    },
    {
      key: 'platform', label: 'Market Place', value: (r) => marketplaceName(r.platform), text: (r) => (r.platform === 'mixed' ? 'Imported' : marketplaceName(r.platform)),
      render: (r) => (isEdit(r) && r.kind !== 'import'
        ? <ComboBox value={editing.platform} onChange={(platform) => set({ platform })} options={MARKET_OPTIONS} placeholder="Market place…" label="Market place" autoFocus={editing.id === NEW} invalid={!editing.platform} />
        : r.platform === 'mixed' ? <span className="text-xs text-muted">Imported</span> : <PlatformBadge platform={r.platform} />),
    },
    {
      key: 'category', label: 'Category', value: (r) => r.category, text: (r) => r.category,
      render: (r) => (isEdit(r) && r.kind !== 'import'
        ? <ComboBox value={editing.category} onChange={(category) => set({ category })} options={categoryOptions} placeholder="Category… (type a new one)" label="Category" creatable onCreate={a.newCategory} invalid={editing.category.trim().length < 2} />
        : r.category),
    },
    {
      key: 'url', label: 'Link', wrap: true, value: (r) => r.url || '', text: (r) => r.url || (r.kind === 'import' ? 'imported sheet' : 'market place search'),
      render: (r) => (isEdit(r) && r.kind !== 'import' ? (
        <div className="flex min-w-[16rem] flex-col gap-0.5 text-left">
          <input
            value={editing.url}
            onChange={(e) => set({ url: e.target.value })}
            inputMode="url"
            placeholder="https://… category or search page (empty = market place search)"
            aria-label="Link"
            aria-invalid={!!check?.linkError}
            className={`h-8 w-full rounded-lg border bg-background px-2.5 text-sm text-foreground placeholder:text-subtle focus:outline-none ${check?.linkError ? 'border-neg' : 'border-divider-light focus:border-accent'}`}
          />
          {check?.linkError && <span className="text-[11px] text-neg">{check.linkError}</span>}
          {check?.newHistory && !check.linkError && <span className="text-[11px] text-subtle">Saving this starts a new history for it.</span>}
        </div>
      ) : r.url
        ? <a href={r.url} target="_blank" rel="noopener noreferrer" title={r.url} className="inline-flex max-w-[16rem] items-center gap-1 truncate text-xs text-link hover:underline"><span className="truncate">{r.url.replace(/^https:\/\/(www\.)?/, '')}</span><ExternalLink size={11} className="shrink-0" /></a>
        : <span className="text-xs text-subtle">{r.key === NEW ? '' : r.kind === 'import' ? 'imported sheet' : 'market place search'}</span>),
    },
    { key: 'products', label: 'Products', numeric: true, value: (r) => r.products, text: (r) => (r.key === NEW ? '' : fmtInt(r.products)), total: 'sum', totalFormat: fmtInt },
    {
      // Filled in by Search itself — nothing to type (lib/research/pageCounts.js).
      key: 'pageCounts', label: 'Products / Page', wrap: true,
      description: 'What each page gave on the last Search: the new products it added (a product already on an earlier page isn’t counted twice), then the total. Amber = a page that probably didn’t load fully; red = a page that couldn’t be read. Hover a page for listed / new / ads. Sorts by the total.',
      value: (r) => (r.key === NEW ? null : pageStates(r)?.total ?? null),
      text: (r) => (r.key === NEW ? '' : pageCountsText(r)),
      total: 'sum', totalFormat: fmtInt,
      render: (r) => (r.key === NEW ? <span className="text-xs text-subtle">filled in by Search</span> : <PageCounts entry={r} range={a.range} />),
    },
    { key: 'days', label: 'Days', numeric: true, value: (r) => r.days, text: (r) => (r.key === NEW ? '' : fmtInt(r.days)) },
    {
      key: 'lastRead', label: 'Last Read', value: (r) => r.lastRead, text: (r) => (r.key === NEW ? '' : fmtDay(r.lastRead)),
      render: (r) => (r.key === NEW ? '' : (
        <span className="inline-flex items-center gap-1" title={r.lastError || ''}>
          {fmtDay(r.lastRead)}
          {r.lastError && <TriangleAlert size={13} className="text-[color:var(--move-down)]" aria-label={`Last read failed: ${r.lastError}`} />}
        </span>
      )),
    },
    {
      key: 'autoDaily', label: 'Daily', description: 'On = read again automatically every day. Off = never automatically — only when you press Search.',
      value: (r) => (r.kind === 'import' ? '' : r.autoDaily !== false ? 'On' : 'Off'), text: (r) => (r.kind === 'import' ? '-' : r.autoDaily !== false ? 'On' : 'Off'),
      render: (r) => (r.kind === 'import'
        ? <span className="text-xs text-subtle">-</span>
        : isEdit(r)
          ? <ToggleSwitch on={editing.autoDaily} onChange={(autoDaily) => set({ autoDaily })} label="Read automatically every day" />
          : <ToggleSwitch on={r.autoDaily !== false} onChange={(on) => a.toggle(r.id, on)} busy={a.saving.has(r.id)} label={`Read ${r.name} automatically every day`} />),
    },
    {
      key: 'actions', label: 'Actions', value: () => '', text: () => '',
      render: (r) => (isEdit(r) ? (
        <span className="inline-flex items-center gap-1">
          <button type="button" onClick={save} disabled={!check?.ok || a.busy === 'save'} className={`${BTN} bg-action text-white hover:bg-action-hover`}><Save size={12} /> {a.busy === 'save' ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={() => setEditing(null)} className={`${BTN} border border-divider-light text-muted hover:text-foreground`}><X size={12} /> Close</button>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1">
          {r.kind !== 'import' && <button type="button" onClick={() => startEdit(r)} disabled={!!editing} className={`${BTN} border border-divider-light text-foreground hover:bg-card-hover`} title={editing ? 'Save or close the row being edited first' : 'Edit this row'}><Pencil size={12} /> Edit</button>}
          <button type="button" onClick={() => setConfirm({ ids: [r.id], label: r.name })} disabled={!!editing} className={`${BTN} border border-neg/30 text-neg hover:bg-neg/10`}><Trash2 size={12} /> Delete</button>
        </span>
      )),
    },
  ];

  if (a.access === 'checking') {
    return <main className="min-h-0 flex-1 overflow-y-auto"><div className="px-4 py-5 sm:px-6 lg:px-10"><LoadingPanel kind="open" label="New Search" /></div></main>;
  }
  if (a.access !== 'ready') {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-divider bg-background p-6 text-center">
          <ShieldAlert size={24} className="text-accent" />
          <h1 className="text-lg font-semibold text-foreground">{a.access === 'error' ? 'This page couldn’t load' : 'This page is for the master admin'}</h1>
          <p className="text-sm text-muted">{a.access === 'error' ? 'Try again in a moment.' : 'The categories tracked every day are on Product Research.'}</p>
          <Link href="/product-research" className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover">Go to Product Research</Link>
        </div>
      </main>
    );
  }

  const busy = !!a.busy;
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex w-full flex-col gap-5 px-4 py-5 sm:px-6 lg:px-10">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground"><Search size={20} className="text-accent" /> New Search</h1>
          <p className="text-xs text-muted">Only you (master admin) see this page. Every signed-in user sees the entries on <Link href="/product-research" className="font-semibold text-link hover:underline">Product Research</Link>.</p>
        </div>

        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={startAdd} disabled={!!editing || busy} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-45">
              <Plus size={15} /> Add
            </button>
            <PageRangePicker value={a.range} onChange={a.setRange} />
            <button type="button" disabled={!tickedIds.length || busy || !!editing} onClick={async () => { await a.run(tickedIds, `${tickedIds.length} ${tickedIds.length === 1 ? 'entry' : 'entries'}`); setReloadKey((k) => k + 1); }} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-action px-4 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-40" title={tickedIds.length ? `Read the ${tickedIds.length} ticked now, pages ${a.range.fromPage}–${a.range.toPage}` : 'Tick rows to search them'}>
              <Search size={15} /> Search{tickedIds.length ? ` (${tickedIds.length})` : ''}
            </button>
            {needFix.length > 0 && (
              <button type="button" disabled={busy || !!editing} onClick={() => setTicked(new Set(needFix))} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--status-warn)]/50 px-3 text-sm font-semibold text-[color:var(--status-warn)] hover:bg-[color:var(--status-warn)]/10 disabled:opacity-40" title="Tick only the entries whose last Search had a page that failed or didn’t load fully (see Products / Page) — then press Search to read them again">
                <TriangleAlert size={14} /> Tick {needFix.length} with a bad page
              </button>
            )}
            <button type="button" disabled={!ticked.size || busy || !!editing} onClick={() => setConfirm({ ids: [...ticked], label: `${ticked.size} entries` })} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neg/40 px-3 text-sm font-semibold text-neg hover:bg-neg/10 disabled:opacity-40">
              <Trash2 size={14} /> Delete ticked
            </button>
            <span className="ml-auto" />
            <FileIconButton icon={FileUp} label="Import Sheet" title="Add a sheet you already have as an entry — columns Link, Date, Price, Review, Rating, Ranking (Bought optional)" accept=".xlsx,.xls,.csv" multiple={false} tone="outline" onFiles={async (f) => { const e = await a.importFile(f[0]); if (e) setShownId(e.id); }} disabled={busy || !!editing} />
          </div>
          <p className="text-xs text-muted">
            {a.entries.length ? `${a.entries.length} entries · ${a.entries.filter((e) => e.autoDaily !== false && e.kind !== 'import').length} read every day · ${needFix.length ? `${needFix.length} with a bad page · ` : ''}` : ''}
            Every entry is read with pages {a.range.fromPage}–{a.range.toPage} (by Search and the daily read). Changing the pages starts a new history for an entry on its next read — switching back brings the old one back.
          </p>
        </section>

        {a.progress && <LoadingPanel progress={a.progress} skeleton={false} />}

        <ResearchTable
          columns={columns}
          rows={rows}
          pinnedRows={pinned}
          defaultSort={{ key: 'name', dir: 'asc' }}
          emptyText="No entries yet — press Add to make the first one."
          selectedKeys={new Set(tickedIds)}
          onToggleRow={(id) => setTicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
          onToggleAll={(ids) => setTicked((cur) => (ids.every((id) => cur.has(id)) ? new Set([...cur].filter((id) => !ids.includes(id))) : new Set([...cur, ...ids])))}
          tickPurpose="to search or delete"
          tickedSummary="ticked"
        />

        {shown ? <EntryProductsView entry={shown} reloadKey={reloadKey} /> : a.entries.length === 0 ? null : <Skeleton />}

        <AdminDataPanel storage={a.storage} onChanged={a.reload} />
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={`Delete ${confirm?.ids.length === 1 ? 'this entry' : confirm?.label}?`}
        description={confirm ? `${confirm.ids.length === 1 ? `“${confirm.label}”` : confirm.label} and the products and daily history saved for ${confirm.ids.length === 1 ? 'it' : 'them'} are deleted, for every user. Users who unlocked ${confirm.ids.length === 1 ? 'it' : 'them'} lose access. This can’t be undone.` : ''}
        confirmLabel="Delete"
        loadingLabel="Deleting…"
        loading={a.busy === 'delete'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const ok = await a.remove(confirm.ids);
          if (ok) setTicked((cur) => new Set([...cur].filter((id) => !confirm.ids.includes(id))));
          setConfirm(null);
        }}
      />
    </main>
  );
}
