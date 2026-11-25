'use client';

import { fmtBought, fmtInt, fmtMoney, fmtRating, fmtSigned } from '@/lib/research/format';

// The title cards over the products the table shows (after its filters) —
// tools-5's KpiCard look: name top-left, big value bottom, a small sub value.
function Card({ name, value, sub, tone = '' }) {
  return (
    <div className="flex min-h-[5.5rem] flex-col justify-between rounded-2xl border border-divider bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted">{name}</span>
        {sub && <span className="text-xs font-medium text-subtle">{sub}</span>}
      </div>
      <div className={`text-[1.5rem] font-bold leading-tight tracking-tight ${tone || 'text-foreground'}`}>{value}</div>
    </div>
  );
}

export function cardsFor(k) {
  return [
    { name: 'Products', value: fmtInt(k.products), sub: `${fmtInt(k.listed)} listed today` },
    { name: 'Avg Price', value: fmtMoney(k.avgPrice == null ? null : Math.round(k.avgPrice)) },
    { name: 'Avg Rating', value: fmtRating(k.avgRating) },
    { name: 'Total Reviews', value: fmtInt(k.totalReviews), sub: `${fmtSigned(k.reviewsGain7)} in 7 days` },
    { name: 'Bought / Month', value: k.boughtProducts ? fmtBought(k.bought) : '-', sub: k.boughtProducts ? `${fmtInt(k.boughtProducts)} Amazon products` : 'Amazon only' },
    { name: 'Rising', value: `▲ ${fmtInt(k.rising)}`, sub: 'up 3+ places this week', tone: 'text-[color:var(--move-up)]' },
    { name: 'Falling', value: `▼ ${fmtInt(k.falling)}`, sub: 'down 3+ places this week', tone: 'text-[color:var(--move-down)]' },
    { name: 'New Entrants', value: fmtInt(k.newcomers), sub: 'first seen ≤ 7 days ago' },
  ];
}

export default function KpiRow({ kpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      {cardsFor(kpis).map((c) => <Card key={c.name} {...c} />)}
    </div>
  );
}
