'use client';

import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import LineChart from './LineChart';
import ResearchTable from './ResearchTable';
import PlatformBadge from './PlatformBadge';
import { METRICS, RANGES, Segmented } from './GraphPanel';
import { dailyColumns } from './columns';
import { dailyRows, seriesFor } from '@/lib/research/metrics';
import { fmtInt, fmtMoney, fmtMove, fmtRank, fmtRating } from '@/lib/research/format';

// One product in depth — its Ranking, Review, Rating and Price graphs side
// by side over the range picked, and its day-by-day history table (the
// sheet layout). `product` = the merged product (history `h`), `summary` =
// its productSummary row, `refDay` = the reference day.
export default function ProductDetailsModal({ product, summary, refDay, onClose }) {
  const [range, setRange] = useState(30);
  const days = useMemo(() => (product ? dailyRows([product]).sort((a, b) => b.date.localeCompare(a.date)) : []), [product]);
  const cols = useMemo(() => dailyColumns({ showProduct: false }), []);
  if (!product || !summary) return null;

  const stat = (label, value) => (
    <div className="rounded-xl border border-divider bg-background px-3 py-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );

  return (
    <Modal open onClose={onClose} title="Product Details" maxWidth="max-w-6xl">
      <div className="flex flex-wrap items-start gap-3">
        {summary.image && (
          // eslint-disable-next-line @next/next/no-img-element -- marketplace CDNs
          <img src={summary.image} alt="" className="h-20 w-20 rounded-lg border border-divider bg-white object-contain" />
        )}
        <div className="min-w-0 flex-1">
          <a href={summary.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-link hover:underline">
            {summary.title} <ExternalLink size={12} className="inline" />
          </a>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <PlatformBadge platform={summary.platform} />
            {summary.query && <span>From: “{summary.query}”</span>}
            <span>Tracked {summary.daysTracked} day{summary.daysTracked === 1 ? '' : 's'}</span>
            {summary.status && <span className="font-semibold text-foreground">{summary.status}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stat('Rank', fmtRank(summary.rank))}
        {stat('Best Rank', fmtRank(summary.bestRank))}
        {stat('1 Week Move', fmtMove(summary.moves.d7))}
        {stat('Price', fmtMoney(summary.price))}
        {stat('Rating', fmtRating(summary.rating))}
        {stat('Reviews', fmtInt(summary.reviews))}
      </div>

      <div className="flex justify-end">
        <Segmented items={RANGES} value={range} onChange={setRange} label="Range" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {METRICS.map((m) => (
          <div key={m.id} className="rounded-2xl border border-divider bg-background p-3">
            <h3 className="mb-1 text-sm font-semibold text-foreground">{m.label}</h3>
            <LineChart
              series={seriesFor([product], m.id, refDay, range).map((s) => ({ ...s, title: m.label, slot: 0 }))}
              invert={!!m.invert}
              format={m.format}
              height={200}
              emptyText={m.id === 'bought' ? 'Only Amazon shows a bought count.' : undefined}
            />
          </div>
        ))}
      </div>

      <h3 className="text-sm font-semibold text-foreground">Day by day</h3>
      <ResearchTable columns={cols} rows={days} defaultSort={{ key: 'date', dir: 'desc' }} emptyText="No snapshots yet." totalLabel="Average" />
    </Modal>
  );
}
