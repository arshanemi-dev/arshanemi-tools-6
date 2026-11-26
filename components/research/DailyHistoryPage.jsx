'use client';

import { useMemo, useState } from 'react';
import { Rows3 } from 'lucide-react';
import { useToast } from '@/components/admin/Toast';
import BillingGateModal from '@/components/billing/BillingGateModal';
import { useResearch } from '@/lib/research/useResearch';
import { dailyRows } from '@/lib/research/metrics';
import { downloadTab } from '@/lib/table/exportTable';
import { marketplaceName } from '@/data/marketplaces';
import { useResearchView } from './useResearchView';
import ResearchFilters from './ResearchFilters';
import ResearchBody from './ResearchBody';
import ResearchTable from './ResearchTable';
import { dailyColumns } from './columns';

// The home page (/product-research): the filters row, then the Daily
// History table — one row per product per day (the sheet layout: Link, Date,
// Price, Review, Bought, Rating, Ranking, rank moves 1 Week … All Time).
// Every signed-in user sees every entry; one not unlocked yet shows its
// Unlock card. Adding and reading entries is the master admin's New Search
// page (with the cards, line chart and Products table).
export default function DailyHistoryPage({ signedIn }) {
  const { addToast } = useToast();
  const r = useResearch({ signedIn, addToast });
  const v = useResearchView(r);
  const [tableView, setTableView] = useState([]);
  const columns = useMemo(() => dailyColumns(), []);
  const rows = useMemo(() => dailyRows(v.products, v.from, v.to), [v.products, v.from, v.to]);

  const doExport = async (kind) => {
    try {
      await downloadTab(kind, {
        label: r.data?.search?.query || 'Product Research',
        tab: {
          tabName: 'Daily History',
          cards: [],
          graphs: [],
          table: { columns: columns.map((c) => c.label), rows: tableView.map((row) => columns.map((c) => (c.key === 'platform' ? marketplaceName(row.platform) : c.key === 'title' ? row.link : c.text(row)))) },
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
      <BillingGateModal gate={r.gate} onClose={r.closeGate} />
    </main>
  );
}
