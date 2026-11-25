'use client';

import LineChart from './LineChart';
import { fmtBought, fmtInt, fmtMoney, fmtRating } from '@/lib/research/format';

// "Graph Part" — one Chart.js line chart (LineChart): what to plot (Ranking
// Status / Review / Rating / Price / Bought) × over how long (7 Days / 15
// Days / 1 Month / 3 Months). One line per product: the ones ticked in the
// table (up to 8 — the validated colour slots; a product keeps its colour
// while others are ticked or unticked), else the top 8 by rank. Each line
// turns on / off from its chip above the chart.
export const METRICS = [
  { id: 'rank', label: 'Ranking Status', invert: true, format: (v) => `#${v}`, hint: 'Higher on the chart = higher in the search results' },
  { id: 'reviews', label: 'Review', format: fmtInt, hint: 'A steep line = fast-growing reviews = selling well' },
  { id: 'rating', label: 'Rating', format: fmtRating, hint: 'Average star rating, day by day' },
  { id: 'price', label: 'Price', format: fmtMoney, hint: 'Selling price, day by day' },
  { id: 'bought', label: 'Bought', format: fmtBought, hint: 'Bought in the past month — Amazon’s own number; other market places don’t show one' },
];
export const RANGES = [
  { id: 7, label: '7 Days' },
  { id: 15, label: '15 Days' },
  { id: 30, label: '1 Month' },
  { id: 90, label: '3 Months' },
];

export function Segmented({ items, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full border border-divider-light bg-background p-0.5">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onChange(it.id)}
          aria-pressed={value === it.id}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${value === it.id ? 'bg-action text-white' : 'text-muted hover:text-foreground'}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export default function GraphPanel({ metric, onMetric, range, onRange, series, days, pickedCount, maxPicked }) {
  const m = METRICS.find((x) => x.id === metric) || METRICS[0];
  return (
    <section className="rounded-2xl border border-divider bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{m.label}</h2>
          <p className="text-[11px] text-subtle">
            {m.hint} · {pickedCount ? `${pickedCount} product${pickedCount === 1 ? '' : 's'} ticked` : `top ${maxPicked} by rank`} — tick rows in the table to compare others (max {maxPicked}).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented items={METRICS} value={metric} onChange={onMetric} label="Graph" />
          <Segmented items={RANGES} value={range} onChange={onRange} label="Range" />
        </div>
      </div>
      <LineChart
        series={series}
        days={days}
        invert={!!m.invert}
        format={m.format}
        toggles
        emptyText={metric === 'bought' ? 'No “bought in past month” numbers here — only Amazon shows them.' : undefined}
      />
    </section>
  );
}
