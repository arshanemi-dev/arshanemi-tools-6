'use client';

import { useCallback, useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, LineChart, ListOrdered, RefreshCw, Rows3 } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import BillingGateModal from '@/components/billing/BillingGateModal';
import IconButton from '@/components/dashboard/IconButton';
import ValueFilter from '@/components/dashboard/ValueFilter';
import DateRangeFilter from '@/components/dashboard/DateRangeFilter';
import { requireLogin } from '@/lib/authGate';
import { useResearch } from '@/lib/research/useResearch';
import { chartDays, dailyRows, kpis as kpisOf, mergeProducts, productSummary, referenceDay, seriesFor } from '@/lib/research/metrics';
import { downloadTab } from '@/lib/table/exportTable';
import { marketplaceName } from '@/data/marketplaces';
import SearchToolbar from './SearchToolbar';
import SearchPicker from './SearchPicker';
import MarketplaceStatus from './MarketplaceStatus';
import KpiRow, { cardsFor } from './KpiRow';
import GraphPanel, { METRICS, RANGES } from './GraphPanel';
import ResearchTable from './ResearchTable';
import ProductDetailsModal from './ProductDetailsModal';
import EmptyState, { NoProducts } from './EmptyState';
import LoadingPanel from './LoadingPanel';
import { dailyColumns, productColumns } from './columns';

const MAX_PICKED = 8; // the validated chart colour slots
const VIEWS = [
  { id: 'products', label: 'Products', icon: ListOrdered },
  { id: 'daily', label: 'Daily History', icon: Rows3 },
];

// The whole Product Research page under the topbar: search row, then the
// open search's filters + actions, status, KPI cards, graph, table.
// While data is still coming in it shows LoadingPanel (live progress +
// placeholders) — never an empty "no data" page; "nothing could be read" is
// only said once the reading has finished.
export default function ResearchWorkspace({ signedIn }) {
  const { addToast } = useToast();
  const r = useResearch({ signedIn, addToast });
  const [platform, setPlatform] = useState('all');
  const [dateRange, setDateRange] = useState({ preset: 'all', from: null, to: null });
  const [view, setView] = useState('products');
  const [metric, setMetric] = useState('rank');
  const [range, setRange] = useState(30);
  const [picked, setPicked] = useState([]); // product keys, in tick order (= colour slot)
  const [detailsKey, setDetailsKey] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [tableView, setTableView] = useState([]);

  const allProducts = useMemo(() => mergeProducts(r.data?.tracks), [r.data]);
  const platformOptions = useMemo(() => [...new Set(allProducts.map((p) => marketplaceName(p.platform)))].sort(), [allProducts]);
  const products = useMemo(() => (platform === 'all' ? allProducts : allProducts.filter((p) => platform.includes(marketplaceName(p.platform)))), [allProducts, platform]);
  const { from, to } = dateRange;
  const refDay = useMemo(() => referenceDay(products, to), [products, to]);
  const summaries = useMemo(
    () => (refDay ? products.map((p) => productSummary(p, refDay, from)).filter((s) => s.daysTracked > 0) : []),
    [products, refDay, from],
  );
  const daily = useMemo(() => (view === 'daily' ? dailyRows(products, from, to) : []), [view, products, from, to]);

  // Graphs: the ticked products, else the top ones by today's rank.
  const byKey = useMemo(() => new Map(products.map((p) => [p.key, p])), [products]);
  // Memoised so the chart only redraws when what it shows changes (not on
  // every keystroke elsewhere on the page).
  const tickedKeys = useMemo(() => picked.filter((k) => byKey.has(k)), [picked, byKey]);
  const graphKeys = useMemo(() => (tickedKeys.length
    ? tickedKeys
    : summaries.filter((s) => s.rank != null).sort((a, b) => a.rank - b.rank).slice(0, MAX_PICKED).map((s) => s.key)), [tickedKeys, summaries]);
  const series = useMemo(() => (refDay
    ? seriesFor(graphKeys.map((k) => byKey.get(k)).filter(Boolean), metric, refDay, range).map((s, i) => ({ ...s, slot: i }))
    : []), [graphKeys, byKey, metric, refDay, range]);
  const days = useMemo(() => chartDays(series, refDay, range), [series, refDay, range]);

  const togglePick = (key) => setPicked((cur) => {
    if (cur.includes(key)) return cur.filter((k) => k !== key);
    if (cur.length >= MAX_PICKED) { addToast(`Up to ${MAX_PICKED} products in the graphs at once — untick one first`, 'error'); return cur; }
    return [...cur, key];
  });
  const toggleAllPicked = (keys) => setPicked((cur) => (keys.every((k) => cur.includes(k)) ? cur.filter((k) => !keys.includes(k)) : [...cur, ...keys.filter((k) => !cur.includes(k))].slice(0, MAX_PICKED)));

  const onDetails = useCallback((key) => setDetailsKey(key), []);
  const pColumns = useMemo(() => productColumns({ onDetails }), [onDetails]);
  const dColumns = useMemo(() => dailyColumns(), []);
  const columns = view === 'products' ? pColumns : dColumns;
  const kpiRows = view === 'products' ? tableView : summaries;
  const kpis = useMemo(() => kpisOf(kpiRows), [kpiRows]);

  const doExport = async (kind) => {
    const cols = columns.filter((c) => c.key !== 'details');
    const m = METRICS.find((x) => x.id === metric);
    try {
      await downloadTab(kind, {
        label: r.data?.search?.query || 'Product Research',
        tab: {
          tabName: view === 'products' ? 'Products' : 'Daily History',
          cards: cardsFor(kpis).map((c) => ({ name: c.name, mainDisplay: c.value, subDisplay: c.sub || '' })),
          graphs: series.length ? [{ name: `${m.label} — ${RANGES.find((x) => x.id === range)?.label}`, chartType: 'line', invert: !!m.invert, series }] : [],
          table: { columns: cols.map((c) => c.label), rows: tableView.map((row) => cols.map((c) => (c.key === 'platform' ? marketplaceName(row.platform) : c.key === 'title' && view === 'daily' ? row.link : c.text(row)))) },
        },
      });
    } catch (err) {
      addToast(`Download failed (${err?.message || 'unknown error'})`, 'error');
    }
  };

  const onSearch = (args) => (signedIn ? r.search(args) : requireLogin());
  const totalProducts = allProducts.length;
  const activeLabel = r.searches.find((s) => s.id === r.activeId)?.query;
  const onImport = (file) => (signedIn ? r.importFile(file) : requireLogin());
  const detailsProduct = detailsKey ? byKey.get(detailsKey) : null;
  const hasData = summaries.length > 0;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-divider bg-background">
        <div className="flex w-full flex-col gap-2 px-4 py-2.5 sm:px-6 lg:px-10">
          <SearchToolbar onSearch={onSearch} onImport={onImport} busy={r.busy === 'search' || r.busy === 'import'} cost={r.cost} signedIn={signedIn} />
          {signedIn && r.listReady && r.searches.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <SearchPicker searches={r.searches} activeId={r.activeId} onPick={(id) => { setPicked([]); r.open(id); }} onDelete={setConfirmDelete} />
              <div role="tablist" aria-label="Table view" className="inline-flex rounded-full border border-divider-light bg-background p-0.5">
                {VIEWS.map(({ id, label, icon: Icon }) => (
                  <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${view === id ? 'bg-action text-white' : 'text-muted hover:text-foreground'}`}>
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <ValueFilter label="Market Places" allLabel="All Market Places" options={platformOptions} value={platform} onChange={setPlatform} align="right" />
                <DateRangeFilter value={dateRange} onChange={setDateRange} />
                <IconButton icon={RefreshCw} label="Refresh" title="Read today's results now (free — once a day per market place / link)" onClick={() => r.refresh(r.activeId)} disabled={!r.activeId || !!r.busy || r.data?.search?.kind === 'import'} />
                <IconButton icon={FileSpreadsheet} label="Excel" title="Download this table (filters and sort as shown) to Excel" onClick={() => doExport('xlsx')} disabled={!hasData} />
                <IconButton icon={FileText} label="PDF" title="Download the cards, graph and this table to PDF" onClick={() => doExport('pdf')} disabled={!hasData} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex w-full flex-col gap-4 px-4 py-4 sm:px-6 lg:px-10">
        {!signedIn ? (
          <EmptyState signedIn={false} cost={r.cost} />
        ) : r.progress && (r.progress.kind !== 'refresh' || !totalProducts || r.loading) ? (
          <LoadingPanel progress={r.progress} label={r.progress.label || activeLabel} />
        ) : !r.listReady ? (
          <LoadingPanel kind="list" />
        ) : !r.searches.length ? (
          <EmptyState signedIn cost={r.cost} />
        ) : r.loading || !r.data || r.data.search?.id !== r.activeId ? (
          <LoadingPanel kind="open" label={activeLabel} />
        ) : !totalProducts ? (
          <NoProducts data={r.data} notice={r.notice} onRefresh={() => r.refresh(r.activeId)} />
        ) : (
          <>
            {r.progress && <LoadingPanel progress={r.progress} compact />}
            <MarketplaceStatus search={r.data.search} status={r.data.status} notice={r.notice} refreshing={r.busy === 'refresh'} />
            <KpiRow kpis={kpis} />
            <GraphPanel metric={metric} onMetric={setMetric} range={range} onRange={setRange} series={series} days={days} pickedCount={tickedKeys.length} maxPicked={MAX_PICKED} />
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <LineChart size={15} className="text-muted" />
              {view === 'products' ? 'Products' : 'Daily History'}
              <span className="text-xs font-normal text-subtle">
                {refDay ? `as of ${refDay}` : ''}{view === 'products' ? ' · tick products to compare them in the graph' : ' · one row per product per day'}
              </span>
            </div>
            <ResearchTable
              key={`${view}:${r.activeId}`}
              columns={columns}
              rows={view === 'products' ? summaries : daily}
              defaultSort={view === 'products' ? { key: 'rank', dir: 'asc' } : { key: 'date', dir: 'desc' }}
              emptyText="No products match these filters — try All Market Places or All Time."
              selectedKeys={view === 'products' ? new Set(tickedKeys) : null}
              onToggleRow={togglePick}
              onToggleAll={toggleAllPicked}
              onView={setTableView}
              totalLabel={view === 'products' ? 'Total / Avg' : 'Average'}
            />
          </>
        )}
      </div>

      {detailsProduct && (
        <ProductDetailsModal
          product={detailsProduct}
          summary={summaries.find((s) => s.key === detailsKey)}
          refDay={refDay}
          onClose={() => setDetailsKey(null)}
        />
      )}
      <BillingGateModal gate={r.gate} onClose={r.closeGate} />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Stop tracking this search?"
        description={confirmDelete ? `“${confirmDelete.query}” leaves your list and stops showing here. Coins already used aren’t refunded; searching it again later counts as a new search.` : ''}
        confirmLabel="Stop tracking"
        loadingLabel="Removing…"
        loading={deleting}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          setDeleting(true);
          await r.remove(confirmDelete);
          setDeleting(false);
          setConfirmDelete(null);
        }}
      />
    </main>
  );
}
