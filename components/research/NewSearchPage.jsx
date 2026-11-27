'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, FileUp, Layers, ListOrdered, Pencil, Plus, Save, Search, ShieldAlert, Trash2, TriangleAlert, X, XCircle } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { FileIconButton } from '@/components/dashboard/IconButton';
import { useAdminEntries } from '@/lib/research/useAdminEntries';
import { fmtDay, fmtInt } from '@/lib/research/format';
import { MARKETPLACES, marketplaceById, marketplaceName, readListingUrl } from '@/data/marketplaces';
import { entryName } from '@/data/entryName';
import { DEFAULT_TARGET, MAX_READ_PAGES, everyDaysOf, readEveryDays, readTarget, targetOf } from '@/data/entrySettings';
import ResearchTable from './ResearchTable';
import PlatformBadge from './PlatformBadge';
import NumberCell from './NumberCell';
import ComboBox from './ComboBox';
import LoadingPanel from './LoadingPanel';
import { RunModal, RunStrip } from './RunModal';
import EntryProductsView from './EntryProductsView';
import AdminDataPanel from './AdminDataPanel';

const NEW = '__new__';
const MARKET_OPTIONS = MARKETPLACES.map((m) => ({ value: m.id, label: m.name, color: m.color }));
const BTN = 'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors disabled:opacity-40';
// The word after a "Read every" box: 0 → "days · off", 1 → "day", 2 → "days".
const daysWord = (n) => (n === 0 ? 'days · off' : n === 1 ? 'day' : 'days');

// How an entry's last read went, in a few words (cleanup.js entryStats
// lastRun) → { text, tone } or null (never read).
function lastRunNote(r) {
  const l = r.lastRun;
  if (!l) return null;
  const pages = l.scrolls ? `1 page, scrolled ${l.scrolls}×` : `${l.pages} page${l.pages === 1 ? '' : 's'}`;
  if (l.stoppedBy === 'failed') return { text: l.count ? `${fmtInt(l.count)} read, then a page failed` : 'last read failed', tone: 'text-neg' };
  if (l.stoppedBy === 'ended') return { text: `${fmtInt(l.count)} — the results ended (${pages})`, tone: 'text-subtle' };
  if (l.stoppedBy === 'limit') return { text: l.scrolls ? `${fmtInt(l.count)} — scrolled as far as one read can (${pages})` : `${fmtInt(l.count)} — stopped at ${MAX_READ_PAGES} pages`, tone: 'text-[color:var(--status-warn)]' };
  if (l.target != null && l.target !== targetOf(r)) return { text: `${fmtInt(l.count)} last time (asked ${fmtInt(l.target)}) — Search to use the new number`, tone: 'text-subtle' };
  return { text: `${fmtInt(l.count)} from ${pages}`, tone: 'text-subtle' };
}

// The New Search page (/product-research/new-search) — the master admin
// only. Nothing of it is drawn until the server has confirmed the role.
// Two tabs:
//   Categories  the entries table (below), then All data (storage + the
//               delete tools)
//   Products    one category's cards and Products table, with a picker for
//               which one; clicking a name in the Categories table opens
//               it here. Drawn the first time it's opened, then kept (its
//               filters stay when you switch back and forth).
// Search runs in the BACKGROUND on the server: a window shows its live
// progress ("Run in background" closes it — a slim strip stays above the
// tabs, with Show); the table updates by itself when it's done. The rows
// being read can't be edited or deleted until then; one Search at a time.
// The Categories table:
//   [+ Add] [Search] [Delete ticked] … [Import Sheet]
//   + Add puts an editable row on top: Market place and Category are
//   searchable dropdowns (a new category: type it + Enter), the link,
//   Products to Read and Read every N days, then Save / Close. Every row's
//   Actions: Edit (the row turns into the same inputs, Save / Close) and
//   Delete. The two numbers can also be typed straight into any row (Enter
//   saves):
//     Products to Read  how many products a read collects — it starts at
//                       page 1 and goes on to the next page by itself until
//                       it has them (no pages to pick)
//     Read every        read again by itself every N days (0 = only Search)
//   Search reads the ticked rows now. A name opens its products below.
export default function NewSearchPage({ signedIn }) {
  const { addToast } = useToast();
  const a = useAdminEntries({ signedIn, addToast });
  const [ticked, setTicked] = useState(() => new Set());
  const [shownId, setShownId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirm, setConfirm] = useState(null); // { ids, label }
  const [editing, setEditing] = useState(null); // { id (NEW or an entry id), platform, category, url, targetProducts, everyDays } — the two numbers as typed
  const [tab, setTab] = useState('categories'); // 'categories' | 'products'
  const [productsOpened, setProductsOpened] = useState(false); // the Products tab is drawn from its first opening on
  const openTab = (id) => { setTab(id); if (id === 'products') setProductsOpened(true); };
  // A category's products, on the Products tab.
  const openProducts = (id) => { setShownId(id); openTab('products'); };

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
    const every = readEveryDays(editing.everyDays);
    const target = readTarget(editing.targetProducts);
    return {
      name, nameTaken, linkError, newHistory, url: link?.url || '',
      everyError: every.error || null, everyDays: every.value, targetError: target.error || null, targetProducts: target.value,
      ok: !!name && !nameTaken && !linkError && !every.error && !target.error,
    };
  }, [editing, a.entries]);

  const startAdd = () => { setEditing({ id: NEW, platform: null, category: '', url: '', targetProducts: String(DEFAULT_TARGET), everyDays: '1' }); };
  const startEdit = (e) => setEditing({ id: e.id, platform: e.platform, category: e.category, url: e.url || '', targetProducts: String(targetOf(e)), everyDays: String(everyDaysOf(e)) });
  const set = (patch) => setEditing((cur) => ({ ...cur, ...patch }));
  const save = async () => {
    if (!check?.ok) return;
    const row = { platform: editing.platform, category: editing.category.trim(), url: check.url, targetProducts: check.targetProducts, everyDays: check.everyDays };
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
  const entryOptions = useMemo(() => a.entries.map((e) => ({ value: e.id, label: e.name, color: marketplaceById(e.platform)?.color })), [a.entries]);
  const tickedIds = [...ticked].filter((id) => a.entries.some((e) => e.id === id && e.kind !== 'import'));
  // Entries whose last read failed (a page couldn't be read) — one click
  // ticks just these, so Search reads again only what needs it.
  const needFix = useMemo(() => a.entries.filter((e) => e.kind !== 'import' && e.lastRun?.stoppedBy === 'failed').map((e) => e.id), [a.entries]);
  const isEdit = (r) => editing?.id === r.key;
  // The entries the background Search is reading right now.
  const readingIds = useMemo(() => new Set(a.running ? a.runDoc.entryIds || [] : []), [a.running, a.runDoc]);
  const READING = 'Being read right now — wait for the Search to finish';
  // A number typed straight into a row → checked, then saved (or why not).
  const saveNumber = (r, key, text) => {
    const read = key === 'everyDays' ? readEveryDays(text) : readTarget(text);
    if (read.error) { addToast(read.error, 'error'); return; }
    a.setSetting(r, { [key]: read.value });
  };

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
        <button type="button" onClick={() => openProducts(r.id)} title="Open its products (Products tab)" className={`font-semibold hover:underline ${r.id === shown?.id ? 'text-accent' : 'text-link'}`}>{r.name}</button>
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
    {
      key: 'products', label: 'Products', numeric: true, value: (r) => r.products, text: (r) => (r.key === NEW ? '' : fmtInt(r.products)), total: 'sum', totalFormat: fmtInt,
      description: 'Every different product this entry has saved, over all its days — one that has left the top of the list is still counted.',
    },
    {
      // Typed by the admin (data/entrySettings.js) — used from the next read.
      key: 'targetProducts', label: 'Products to Read', numeric: true,
      description: `How many products a read collects. It starts at page 1 and goes on to the next page by itself until it has this many (ads not counted) — or the results end, or ${MAX_READ_PAGES} pages were read. Type a number, then Enter. Under it: how the last read went.`,
      value: (r) => (r.key === NEW || r.kind === 'import' ? null : targetOf(r)),
      text: (r) => (r.kind === 'import' ? '-' : r.key === NEW ? '' : String(targetOf(r))),
      render: (r) => {
        if (r.kind === 'import') return <span className="text-xs text-subtle">-</span>;
        if (isEdit(r)) {
          return (
            <span className="inline-flex flex-col items-start gap-0.5">
              <NumberCell value={editing.targetProducts} onChange={(targetProducts) => set({ targetProducts })} suffix="products" min={1} label="How many products a read collects" invalid={!!check?.targetError} />
              {check?.targetError && <span className="max-w-[12rem] whitespace-normal text-[11px] text-neg">1–1000</span>}
            </span>
          );
        }
        const note = readingIds.has(r.id) ? { text: 'reading now…', tone: 'font-semibold text-link' } : lastRunNote(r);
        return (
          <span className="inline-flex flex-col items-start gap-0.5">
            <NumberCell value={targetOf(r)} onCommit={(t) => saveNumber(r, 'targetProducts', t)} suffix="products" min={1} busy={a.saving.has(r.id) || !!editing} label={`How many products ${r.name} collects on a read — Enter saves`} />
            {note && <span className={`max-w-[14rem] whitespace-normal text-[11px] ${note.tone}`} title={r.lastRun?.error || ''}>Last: {note.text}</span>}
          </span>
        );
      },
    },
    { key: 'days', label: 'Learn Count', numeric: true, value: (r) => r.days, text: (r) => (r.key === NEW ? '' : fmtInt(r.days)) },
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
      key: 'everyDays', label: 'Read Every', numeric: true,
      description: 'Read again by itself every N days: 1 = every day, 2 = every 2 days, 7 = once a week … 0 = never by itself, only when you press Search. Type a number, then Enter.',
      value: (r) => (r.key === NEW || r.kind === 'import' ? null : everyDaysOf(r)),
      text: (r) => (r.kind === 'import' ? '-' : r.key === NEW ? '' : String(everyDaysOf(r))),
      render: (r) => {
        if (r.kind === 'import') return <span className="text-xs text-subtle">-</span>;
        if (isEdit(r)) {
          const n = check?.everyDays;
          return (
            <span className="inline-flex flex-col items-start gap-0.5">
              <NumberCell value={editing.everyDays} onChange={(everyDays) => set({ everyDays })} suffix={check?.everyError ? 'days' : daysWord(n)} label="Read again by itself every N days (0 = only by Search)" invalid={!!check?.everyError} />
              {check?.everyError && <span className="max-w-[12rem] whitespace-normal text-[11px] text-neg">0–365 (0 = only by Search)</span>}
            </span>
          );
        }
        const n = everyDaysOf(r);
        return <NumberCell value={n} onCommit={(t) => saveNumber(r, 'everyDays', t)} suffix={daysWord(n)} busy={a.saving.has(r.id) || !!editing} label={`Read ${r.name} again by itself every N days (0 = only by Search) — Enter saves`} />;
      },
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
          {r.kind !== 'import' && <button type="button" onClick={() => startEdit(r)} disabled={!!editing || readingIds.has(r.id)} className={`${BTN} border border-divider-light text-foreground hover:bg-card-hover`} title={readingIds.has(r.id) ? READING : editing ? 'Save or close the row being edited first' : 'Edit this row'}><Pencil size={12} /> Edit</button>}
          <button type="button" onClick={() => setConfirm({ ids: [r.id], label: r.name })} disabled={!!editing || readingIds.has(r.id)} title={readingIds.has(r.id) ? READING : undefined} className={`${BTN} border border-neg/30 text-neg hover:bg-neg/10`}><Trash2 size={12} /> Delete</button>
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
  const TABS = [
    { id: 'categories', label: 'Categories', icon: Layers, count: a.entries.length },
    { id: 'products', label: 'Products', icon: ListOrdered, count: null },
  ];
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex w-full flex-col gap-5 px-4 py-5 sm:px-6 lg:px-10">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground"><Search size={20} className="text-accent" /> New Search</h1>
          <p className="text-xs text-muted">Only you (master admin) see this page. Every signed-in user sees the entries on <Link href="/product-research" className="font-semibold text-link hover:underline">Product Research</Link>.</p>
        </div>

        {/* The two tabs */}
        <div role="tablist" aria-label="New Search" className="flex items-center gap-1 border-b border-divider">
          {TABS.map((t) => {
            const on = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={on}
                aria-controls={`panel-${t.id}`}
                onClick={() => openTab(t.id)}
                className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${on ? 'border-accent text-foreground' : 'border-transparent text-muted hover:text-foreground'}`}
              >
                <Icon size={15} className={on ? 'text-accent' : ''} aria-hidden />
                {t.label}
                {t.count != null && <span className="rounded-full bg-card px-1.5 text-[11px] font-semibold tabular-nums text-muted">{t.count}</span>}
              </button>
            );
          })}
        </div>

        {/* A Search's live progress — seen from either tab */}
        {a.progress && <LoadingPanel progress={a.progress} skeleton={false} />}
        {a.running && !a.runOpen && <RunStrip run={a.runDoc} onShow={() => a.setRunOpen(true)} />}

        {/* Categories: the table, then All data */}
        <div role="tabpanel" id="panel-categories" aria-labelledby="tab-categories" className={`${tab === 'categories' ? 'flex' : 'hidden'} flex-col gap-5`}>
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={startAdd} disabled={!!editing || busy} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-45">
                <Plus size={15} /> Add
              </button>
              <button type="button" disabled={!tickedIds.length || busy || !!editing || a.running} onClick={() => a.run(tickedIds)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-action px-4 text-sm font-semibold text-white hover:bg-action-hover disabled:opacity-40" title={a.running ? 'A Search is running — one at a time (Show above to see it)' : tickedIds.length ? `Read the ${tickedIds.length} ticked in the background — each until it has its Products to Read` : 'Tick rows to search them'}>
                <Search size={15} /> {a.running ? 'Searching…' : `Search${tickedIds.length ? ` (${tickedIds.length})` : ''}`}
              </button>
              {needFix.length > 0 && (
                <button type="button" disabled={busy || !!editing} onClick={() => setTicked(new Set(needFix))} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--status-warn)]/50 px-3 text-sm font-semibold text-[color:var(--status-warn)] hover:bg-[color:var(--status-warn)]/10 disabled:opacity-40" title="Tick only the entries whose last read failed (a page couldn’t be read) — then press Search to read them again">
                  <TriangleAlert size={14} /> Tick {needFix.length} that failed
                </button>
              )}
              <button type="button" disabled={!ticked.size || busy || !!editing || [...ticked].some((id) => readingIds.has(id))} title={[...ticked].some((id) => readingIds.has(id)) ? READING : undefined} onClick={() => setConfirm({ ids: [...ticked], label: `${ticked.size} entries` })} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neg/40 px-3 text-sm font-semibold text-neg hover:bg-neg/10 disabled:opacity-40">
                <Trash2 size={14} /> Delete ticked
              </button>
              <span className="ml-auto" />
              <FileIconButton icon={FileUp} label="Import Sheet" title="Add a sheet you already have as an entry — columns Link, Date, Price, Review, Rating, Ranking (Bought optional)" accept=".xlsx,.xls,.csv" multiple={false} tone="outline" onFiles={async (f) => { const e = await a.importFile(f[0]); if (e) openProducts(e.id); }} disabled={busy || !!editing} />
            </div>
            <p className="text-xs text-muted">
              {a.entries.length ? `${a.entries.length} entries · ${a.entries.filter((e) => everyDaysOf(e) > 0 && e.kind !== 'import').length} read by themselves · ${needFix.length ? `${needFix.length} failed last time · ` : ''}` : ''}
              Every read starts at page 1 and goes on to the next page by itself until it has the entry’s Products to Read (at most {MAX_READ_PAGES} pages). Changing that number keeps the entry’s history. Click a name to see its products.
            </p>
          </section>

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

          <AdminDataPanel storage={a.storage} onChanged={a.reload} />
        </div>

        {/* Products: one category's cards + Products table, picked here */}
        {productsOpened && (
          <div role="tabpanel" id="panel-products" aria-labelledby="tab-products" className={`${tab === 'products' ? 'flex' : 'hidden'} flex-col gap-4`}>
            {shown ? (
              <EntryProductsView
                entry={shown}
                reloadKey={reloadKey + a.runFinished}
                heading={(
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><ListOrdered size={16} className="text-accent" aria-hidden /> Products of</span>
                    <div className="w-72 max-w-full">
                      <ComboBox value={shown.id} onChange={(id) => id && setShownId(id)} options={entryOptions} placeholder="Pick a category…" label="Category whose products are shown" />
                    </div>
                  </div>
                )}
              />
            ) : (
              <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-divider bg-background p-6 text-center">
                <Layers size={24} className="text-accent" />
                <p className="text-sm text-muted">No categories yet — add one on the Categories tab, press Search, and its products show here.</p>
                <button type="button" onClick={() => openTab('categories')} className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover">Go to Categories</button>
              </div>
            )}
          </div>
        )}
      </div>

      <RunModal run={a.runDoc} open={a.runOpen} onClose={() => a.setRunOpen(false)} />

      <ConfirmDialog
        open={!!confirm}
        title={`Delete ${confirm?.ids.length === 1 ? 'this entry' : confirm?.label}?`}
        description={confirm ? `${confirm.ids.length === 1 ? `“${confirm.label}”` : confirm.label} and the products and daily history saved for ${confirm.ids.length === 1 ? 'it' : 'them'} are deleted, for every user. Users who added ${confirm.ids.length === 1 ? 'it' : 'them'} lose it, with no refund for a month already paid. This can’t be undone.` : ''}
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
