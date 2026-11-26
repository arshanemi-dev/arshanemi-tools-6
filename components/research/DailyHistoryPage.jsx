'use client';

import { useMemo, useState } from 'react';
import { Rows3 } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import { useResearch } from '@/lib/research/useResearch';
import { dailyRows } from '@/lib/research/metrics';
import { downloadTab } from '@/lib/table/exportTable';
import { marketplaceName } from '@/data/marketplaces';
import { useResearchView } from './useResearchView';
import ResearchFilters from './ResearchFilters';
import ResearchBody from './ResearchBody';
import ResearchTable from './ResearchTable';
import { dailyColumns } from './columns';
import EntryBillingModals from './EntryBillingModals';
import ProductHistoryModal from './ProductHistoryModal';

// The home page (/product-research): the filters row, then the Daily
// History table — one row per product per day (the sheet layout: Link, Date,
// Price, Review, Bought, Rating, Ranking, rank moves 1 Week … All Time).
// Each row's Details opens that product's history window: day / week /
// month columns with averages and totals, a chart and its trend.
// Login is required. Entries ▾ holds the user's own entries (My Entries,
// paid a month at a time — data/billing.js); an Expired one shows its Renew
// card. Adding and reading entries is the master admin's New Search page
// (with the cards, line chart and Products table).
export default function DailyHistoryPage({ signedIn }) {
  const { addToast } = useToast();
  const r = useResearch({ signedIn, addToast });
  const v = useResearchView(r);
  const [tableView, setTableView] = useState([]);
  // A row's Details button → that product's history window.
  const [detailsKey, setDetailsKey] = useState(null);
  // Several entries ticked together → an Entry column says which row is whose.
  const many = (r.data?.search?.entries?.length || 0) > 1;
  const columns = useMemo(() => dailyColumns({ showEntry: many, onDetails: setDetailsKey }), [many]);
  const rows = useMemo(() => dailyRows(v.products, v.from, v.to), [v.products, v.from, v.to]);
  const detailsProduct = useMemo(() => (detailsKey ? v.products.find((p) => p.key === detailsKey) || null : null), [detailsKey, v.products]);

  const doExport = async (kind) => {
    const cols = columns.filter((c) => !c.noExport);
    try {
      await downloadTab(kind, {
        label: r.data?.search?.query || 'Product Research',
        tab: {
          tabName: 'Daily History',
          cards: [],
          graphs: [],
          table: { columns: cols.map((c) => c.label), rows: tableView.map((row) => cols.map((c) => (c.key === 'platform' ? marketplaceName(row.platform) : c.key === 'title' ? row.link : c.text(row)))) },
        },
      });
    } catch (err) {
      addToast(`Download failed (${err?.message || 'unknown error'})`, 'error');
    }
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      {signedIn && <ResearchFilters r={r} v={v} onExport={doExport} canExport={rows.length > 0} pdfTitle="Download the Daily History table to PDF" />}
      <ResearchBody signedIn={signedIn} r={r} v={v}>
        {() => (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
              <Rows3 size={15} className="text-muted" />
              Daily History
              <span className="text-xs font-normal text-subtle">
                {r.data?.search?.query ? `“${r.data.search.query}” · ` : ''}one row per product per day{v.refDay ? ` · up to ${v.refDay}` : ''}
              </span>
            </div>
            <ResearchTable
              key={r.activeId}
              columns={columns}
              rows={rows}
              defaultSort={{ key: 'date', dir: 'desc' }}
              emptyText="No days match these filters — try All Market Places or All Time."
              onView={setTableView}
              totalLabel="Average"
            />
          </>
        )}
      </ResearchBody>
      <EntryBillingModals b={r.billing} />
      {detailsProduct && <ProductHistoryModal key={detailsKey} product={detailsProduct} refDay={v.refDay} onClose={() => setDetailsKey(null)} />}
    </main>
  );
}
