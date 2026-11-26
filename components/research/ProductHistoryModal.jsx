'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, LineChart as LineIcon, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { historyTable, PERIODS, shortDay, trendOf } from '@/lib/research/history';
import { fmtBought, fmtInt, fmtMoney, fmtSigned } from '@/lib/research/format';
import { daysBetweenISO } from '@/lib/research/time';
import PlatformBadge from './PlatformBadge';
import HistoryTrendChart from './HistoryTrendChart';
import { Segmented } from './GraphPanel';

// The Details window of a Daily History row — one product, step by step
// (lib/research/history.js). It covers the whole page:
//   Period   3 Days · 1 Week · 15 Days (a column per day) · 1 Month (Week 1
//            … Week 5) · All Time (a column per month)
//   Chart    one measure per step + its straight trend line; above it the
//            Average, the Growth (first → last) and the Trend (direction +
//            angle)
//   Table    every measure: Average and Total first, then every step —
//            clicking a row puts that measure on the chart.
// Chart and table sit side by side on wide screens, stacked on small ones.
// Buttons, never dropdowns. `product` = a merged product (history `h`,
// title, link, platform, entry), `refDay` = the latest tracked day in the
// date filter.

const rankText = (v) => (v == null ? '-' : `#${Number.isInteger(v) ? v : v.toFixed(1)}`);
const ratingText = (v) => (v == null ? '-' : Number(v).toFixed(Number.isInteger(v * 10) ? 1 : 2));
const FORMAT = {
  rank: rankText,
  price: fmtMoney,
  reviews: fmtInt,
  gained: (v) => fmtSigned(v),
  rating: ratingText,
  bought: fmtBought,
  days: fmtInt,
};
// What can go on the chart (Days tracked can't).
const CHARTABLE = [
  { id: 'rank', label: 'Rank' },
  { id: 'price', label: 'Price' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'gained', label: 'Reviews gained' },
  { id: 'rating', label: 'Rating' },
  { id: 'bought', label: 'Bought' },
];
// Up is good for these; for price it's neither (no good/bad colour).
const GOOD_WHEN_UP = new Set(['rank', 'reviews', 'gained', 'rating', 'bought']);

function TrendTiles({ metric, row, trend }) {
  const f = FORMAT[metric];
  const isRank = metric === 'rank';
  const tile = (label, value, sub, tone = 'text-foreground') => (
    <div className="rounded-xl border border-divider bg-background px-3 py-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-subtle">{sub}</p>}
    </div>
  );
  const lastKnown = row.values.filter((v) => v != null).at(-1) ?? null;
  let growth = '-';
  let growthSub = null;
  if (trend) {
    growthSub = `${f(trend.first)} → ${f(trend.last)}`;
    growth = isRank
      ? (trend.growth === 0 ? 'No move' : `${trend.growth > 0 ? '▲' : '▼'} ${fmtInt(Math.abs(trend.growth))} place${Math.abs(trend.growth) === 1 ? '' : 's'}`)
      : `${fmtSigned(trend.last - trend.first, metric === 'price')}${trend.growthPct != null ? ` (${trend.growthPct > 0 ? '+' : ''}${trend.growthPct}%)` : ''}`;
  }
  const word = !trend ? null : trend.direction === 'flat' ? 'Steady' : isRank ? (trend.direction === 'up' ? 'Climbing' : 'Slipping') : trend.direction === 'up' ? 'Rising' : 'Falling';
  const Icon = !trend ? Minus : trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus;
  const tone = !trend || trend.direction === 'flat' || !GOOD_WHEN_UP.has(metric)
    ? 'text-foreground'
    : trend.direction === 'up' ? 'text-[color:var(--move-up)]' : 'text-[color:var(--move-down)]';

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {tile(row.kind === 'last' ? 'Latest' : row.kind === 'gain' ? 'Average per step' : 'Average', row.kind === 'last' ? f(lastKnown) : f(row.average), row.kind === 'gain' && row.total != null ? `${fmtSigned(row.total)} in all` : null)}
      {tile(isRank ? 'Growth (places climbed)' : 'Growth', growth, growthSub)}
      <div className="rounded-xl border border-divider bg-background px-3 py-2">
        <p className="text-[11px] text-muted">Trend</p>
        {trend ? (
          <>
            <p className={`inline-flex items-center gap-1.5 text-lg font-bold ${tone}`}><Icon size={18} aria-hidden /> {word}</p>
            <p className="text-[11px] text-subtle" title="How steep the trend line is: 0° = flat, 45° = it moved by as much as its own average over this period">
              Angle {trend.angle > 0 ? '+' : ''}{trend.angle}° · 0° flat, 45° very steep
            </p>
          </>
        ) : <p className="text-sm text-subtle">Needs 2 or more values</p>}
      </div>
    </div>
  );
}

export default function ProductHistoryModal({ product, refDay, onClose }) {
  const [period, setPeriod] = useState('d7');
  const [metric, setMetric] = useState('rank');
  const table = useMemo(() => (product && refDay ? historyTable(product, period, refDay) : { steps: [], rows: [], days: [] }), [product, refDay, period]);
  const row = table.rows.find((r) => r.id === metric);
  const trend = useMemo(() => (row ? trendOf(row.values, { invert: !!row.invert }) : null), [row]);
  if (!product) return null;

  const { steps } = table;
  const span = steps.length ? `${shortDay(steps[0].from)} – ${shortDay(steps[steps.length - 1].to)}` : '';
  const tracked = table.days.length;
  const periodDays = steps.length ? daysBetweenISO(steps[steps.length - 1].to, steps[0].from) + 1 : 0;
  const label = CHARTABLE.find((m) => m.id === metric)?.label || 'Rank';
  const unit = PERIODS.find((p) => p.id === period)?.step;

  return (
    <Modal open onClose={onClose} title="Product History" fullScreen>
      {/* The product */}
      <div className="flex flex-wrap items-start gap-3">
        {product.image && (
          // eslint-disable-next-line @next/next/no-img-element -- marketplace CDNs, any host
          <img src={product.image} alt="" className="h-16 w-16 rounded-lg border border-divider bg-white object-contain" />
        )}
        <div className="min-w-0 flex-1">
          <a href={product.link} target="_blank" rel="noopener noreferrer" className="line-clamp-2 font-semibold text-link hover:underline">
            {product.title || product.link} <ExternalLink size={12} className="inline" />
          </a>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            {product.platform && product.platform !== 'mixed' && <PlatformBadge platform={product.platform} />}
            {product.entry && <span className="font-semibold text-foreground">{product.entry}</span>}
            {span && <span>{span} · tracked {tracked} of {periodDays} day{periodDays === 1 ? '' : 's'}</span>}
          </div>
        </div>
      </div>

      {/* What to look at — buttons, not dropdowns */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented items={PERIODS} value={period} onChange={setPeriod} label="Period" />
        <Segmented items={CHARTABLE} value={metric} onChange={setMetric} label="Chart" />
      </div>

      {row && <TrendTiles metric={metric} row={row} trend={trend} />}

      {/* Chart and table side by side on wide screens, one under the other on small ones */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-2xl border border-divider bg-background p-3">
          <h3 className="mb-1 text-sm font-semibold text-foreground">
            {label} {row?.kind === 'avg' ? `— average per ${unit}` : row?.kind === 'gain' ? `per ${unit}` : row?.kind === 'last' ? `— at the end of each ${unit}` : ''}
            {metric === 'rank' && <span className="ml-2 text-[11px] font-normal text-subtle">#1 at the top — higher on the chart = higher in the search results</span>}
          </h3>
          <HistoryTrendChart
            labels={steps.map((s) => s.label)}
            values={row?.values || []}
            trend={trend}
            invert={!!row?.invert}
            format={FORMAT[metric]}
            name={label}
            height={300}
          />
        </section>

        {/* Every measure × every step — Average and Total first, then the steps */}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="overflow-x-auto rounded-xl border border-divider">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#1565C0] text-white">
                  <th className="sticky left-0 z-[1] bg-[#1565C0] px-3 py-1.5 text-left text-xs font-semibold">Measure</th>
                  <th className="whitespace-nowrap bg-[#dcfce7] px-3 py-1.5 text-center text-xs font-semibold text-black">Average</th>
                  <th className="whitespace-nowrap border-r border-divider bg-[#dcfce7] px-3 py-1.5 text-center text-xs font-semibold text-black">Total</th>
                  {steps.map((s) => (
                    <th key={s.id} className="whitespace-nowrap px-3 py-1.5 text-center text-xs font-semibold">
                      {s.label}
                      {s.sub && <span className="block text-[10px] font-normal opacity-80">{s.sub}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => {
                  const f = FORMAT[r.id];
                  const chartable = CHARTABLE.some((m) => m.id === r.id);
                  const on = r.id === metric;
                  return (
                    <tr
                      key={r.id}
                      onClick={chartable ? () => setMetric(r.id) : undefined}
                      className={`border-t border-divider ${chartable ? 'cursor-pointer hover:bg-card-hover' : ''} ${on ? 'bg-action-soft' : ''}`}
                      title={chartable ? `Show ${r.label} on the chart` : undefined}
                    >
                      <th scope="row" className={`sticky left-0 z-[1] whitespace-nowrap px-3 py-1.5 text-left text-xs font-semibold text-foreground ${on ? 'bg-action-soft' : 'bg-background'}`}>
                        <span className="inline-flex items-center gap-1">{on && <LineIcon size={12} className="text-action" aria-label="on the chart" />}{r.label}</span>
                      </th>
                      <td className="whitespace-nowrap bg-card px-3 py-1.5 text-center font-semibold tabular-nums text-foreground">{r.average == null ? '-' : f(r.average)}</td>
                      <td className="whitespace-nowrap border-r border-divider bg-card px-3 py-1.5 text-center font-semibold tabular-nums text-foreground">{r.total == null ? '-' : f(r.total)}</td>
                      {r.values.map((v, i) => (
                        <td key={steps[i].id} className={`whitespace-nowrap px-3 py-1.5 text-center tabular-nums ${v == null ? 'text-subtle' : 'text-foreground'}`}>{v == null ? '-' : f(v)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-subtle">
            Average and Total cover the whole period · Rank, Price, Rating and Bought: the average of the days in each column · Reviews: the count on its last day · Reviews gained: new reviews in it · “-” = no snapshot then.
          </p>
        </div>
      </div>
    </Modal>
  );
}
