'use client';

import { MAX_PAGE, MAX_SPAN } from '@/data/marketplaces';

const PAGE_NUMBERS = Array.from({ length: MAX_PAGE }, (_, i) => i + 1);
const SELECT = 'rounded-md bg-card px-1 py-0.5 font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-accent';

// "Pages From [1] To [3]" — which result pages of the link to read. Can
// never be wrong: moving From past To moves To with it, and more than
// MAX_SPAN pages pulls the other end in. `value` = { fromPage, toPage }.
export default function PageRangePicker({ value, onChange }) {
  const { fromPage, toPage } = value;
  const pickFrom = (n) => onChange({ fromPage: n, toPage: toPage < n ? n : toPage - n + 1 > MAX_SPAN ? n + MAX_SPAN - 1 : toPage });
  const pickTo = (n) => onChange({ toPage: n, fromPage: fromPage > n ? n : n - fromPage + 1 > MAX_SPAN ? n - MAX_SPAN + 1 : fromPage });
  const count = toPage - fromPage + 1;
  return (
    <div
      role="group"
      aria-label="Result pages to read"
      title={`Reads result pages ${fromPage} to ${toPage} (${count} page${count === 1 ? '' : 's'}, at most ${MAX_SPAN}). More pages = more products ranked, and a slower read.`}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-divider-light bg-background px-3 text-sm text-muted"
    >
      Pages
      <label className="inline-flex items-center gap-1">
        <span className="text-xs">From</span>
        <select value={fromPage} onChange={(e) => pickFrom(Number(e.target.value))} aria-label="From page" className={SELECT}>
          {PAGE_NUMBERS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label className="inline-flex items-center gap-1">
        <span className="text-xs">To</span>
        <select value={toPage} onChange={(e) => pickTo(Number(e.target.value))} aria-label="To page" className={SELECT}>
          {PAGE_NUMBERS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <span className="text-[11px] text-subtle">({count} page{count === 1 ? '' : 's'})</span>
    </div>
  );
}
