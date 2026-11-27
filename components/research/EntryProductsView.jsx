'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, ListOrdered } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import IconButton from '@/components/dashboard/IconButton';
import DateRangeFilter from '@/components/dashboard/DateRangeFilter';
import { getEntry } from '@/lib/research/apiClient';
import { chartDays, kpis as kpisOf, productSummary, seriesFor } from '@/lib/research/metrics';
import { downloadTab } from '@/lib/table/exportTable';
import { marketplaceName } from '@/data/marketplaces';
import { useResearchView } from './useResearchView';
import ResearchTable from './ResearchTable';
import KpiRow, { cardsFor } from './KpiRow';
import GraphPanel, { METRICS, RANGES } from './GraphPanel';
import ProductDetailsModal from './ProductDetailsModal';
import MarketplaceStatus from './MarketplaceStatus';
import LoadingPanel from './LoadingPanel';
import { NoProducts } from './EmptyState';
import { productColumns } from './columns';

const MAX_PICKED = 8; // the validated chart colour slots

// One entry's products, on the admin's New Search page (it was the Products
// page): Date / Excel / PDF, the cards, the line chart and the Products table
// with Details. Ticking rows picks the chart's lines (else the top 8 by
// rank). `entry` = the entry picked in the table; `reloadKey` changes after
// a read so the view shows the fresh data. `heading` = drawn in place of the
// "Products of …" title (the Products tab puts its category picker there).
export default function EntryProductsView({ entry, reloadKey, heading = null }) {
  const { addToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState('rank');
  const [range, setRange] = useState(30);
  const [picked, setPicked] = useState([]);
  const [detailsKey, setDetailsKey] = useState(null);
  const [tableView, setTableView] = useState([]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await getEntry(entry.id);
      if (!alive) return;
      setLoading(false);
      if (res.ok) { setData(res.data); setPicked([]); } else addToast(res.data?.error || 'Could not open this entry', 'error');
    }, 0);
    return () => { alive = false; clearTimeout(t); };
  }, [entry.id, reloadKey, addToast]);

  const r = useMemo(() => ({ data, searches: [{ id: entry.id, query: entry.name }], activeId: entry.id }), [data, entry.id, entry.name]);
  const v = useResearchView(r);
  const { products, refDay, from } = v;
  const summaries = useMemo(() => (refDay ? products.map((p) => productSummary(p, refDay, from)).filter((s) => s.daysTracked > 0) : []), [products, refDay, from]);
  const byKey = useMemo(() => new Map(products.map((p) => [p.key, p])), [products]);
  const tickedKeys = useMemo(() => picked.filter((k) => byKey.has(k)), [picked, byKey]);
  const graphKeys = useMemo(() => (tickedKeys.length
    ? tickedKeys
    : summaries.filter((s) => s.rank != null).sort((a, b) => a.rank - b.rank).slice(0, MAX_PICKED).map((s) => s.key)), [tickedKeys, summaries]);
  const series = useMemo(() => (refDay
    ? seriesFor(graphKeys.map((k) => byKey.get(k)).filter(Boolean), metric, refDay, range).map((s, i) => ({ ...s, slot: i }))
    : []), [graphKeys, byKey, metric, refDay, range]);
  const days = useMemo(() => chartDays(series, refDay, range), [series, refDay, range]);
  const ticked = useMemo(() => new Set(tickedKeys), [tickedKeys]);
  const onDetails = useCallback((key) => setDetailsKey(key), []);
  const columns = useMemo(() => productColumns({ onDetails }), [onDetails]);
  const kpis = useMemo(() => kpisOf(tableView), [tableView]);

  const togglePick = (key) => setPicked((cur) => {
    if (cur.includes(key)) return cur.filter((k) => k !== key);
    if (cur.length >= MAX_PICKED) { addToast(`Up to ${MAX_PICKED} products in the chart at once — untick one first`, 'error'); return cur; }
    return [...cur, key];
  });
  const toggleAllPicked = (keys) => setPicked((cur) => (keys.every((k) => cur.includes(k)) ? cur.filter((k) => !keys.includes(k)) : [...cur, ...keys.filter((k) => !cur.includes(k))].slice(0, MAX_PICKED)));

  const doExport = async (kind) => {
    const cols = columns.filter((c) => c.key !== 'details');
    const m = METRICS.find((x) => x.id === metric);
    try {
      await downloadTab(kind, {
        label: entry.name,
        tab: {
          tabName: 'Products',
          cards: cardsFor(kpis).map((c) => ({ name: c.name, mainDisplay: c.value, subDisplay: c.sub || '' })),
          graphs: series.length ? [{ name: `${m.label} — ${RANGES.find((x) => x.id === range)?.label}`, chartType: 'line', invert: !!m.invert, series }] : [],
          table: { columns: cols.map((c) => c.label), rows: tableView.map((row) => cols.map((c) => (c.key === 'platform' ? marketplaceName(row.platform) : c.text(row)))) },
        },
      });
    } catch (err) {
      addToast(`Download failed (${err?.message || 'unknown error'})`, 'error');
    }
  };

  const detailsProduct = detailsKey ? byKey.get(detailsKey) : null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {heading || <h2 className="flex items-center gap-2 text-base font-semibold text-foreground"><ListOrdered size={17} className="text-accent" /> Products of <code className="rounded-md bg-card px-2 py-0.5">{entry.name}</code></h2>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <DateRangeFilter value={v.dateRange} onChange={v.setDateRange} />
          <IconButton icon={FileSpreadsheet} label="Excel" title="Download this table (filters and sort as shown) to Excel" onClick={() => doExport('xlsx')} disabled={!summaries.length} />
          <IconButton icon={FileText} label="PDF" title="Download the cards, chart and Products table to PDF" onClick={() => doExport('pdf')} disabled={!summaries.length} />
        </div>
      </div>
      {loading && !data ? (
        <LoadingPanel kind="open" label={entry.name} />
      ) : !v.totalProducts ? (
        <NoProducts data={data} isAdmin />
      ) : (
        <>
          <MarketplaceStatus search={data.search} status={data.status} />
          <KpiRow kpis={kpis} />
          {/* <GraphPanel metric={metric} onMetric={setMetric} range={range} onRange={setRange} series={series} days={days} pickedCount={tickedKeys.length} maxPicked={MAX_PICKED} /> */}
          <ResearchTable
            key={entry.id}
            columns={columns}
            rows={summaries}
            defaultSort={{ key: 'rank', dir: 'asc' }}
            emptyText="No products match these filters — try All Time."
            selectedKeys={ticked}
            onToggleRow={togglePick}
            onToggleAll={toggleAllPicked}
            onView={setTableView}
            totalLabel="Total / Avg"
          />
        </>
      )}
      {detailsProduct && (
        <ProductDetailsModal product={detailsProduct} summary={summaries.find((s) => s.key === detailsKey)} refDay={refDay} onClose={() => setDetailsKey(null)} />
      )}
    </section>
  );
}
