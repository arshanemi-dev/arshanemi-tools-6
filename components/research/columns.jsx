'use client';

import { BarChart3, ExternalLink } from 'lucide-react';
import { WINDOWS } from '@/lib/research/metrics';
import { fmtBought, fmtDay, fmtInt, fmtMoney, fmtMove, fmtPct, fmtRank, fmtRating, fmtSigned } from '@/lib/research/format';
import PlatformBadge from './PlatformBadge';

// Column definitions for ResearchTable (see its header for the shape).

const moveTone = (v) => (v == null || v === 0 ? 'text-muted' : v > 0 ? 'font-semibold text-[color:var(--move-up)]' : 'font-semibold text-[color:var(--move-down)]');
const STATUS_TONE = {
  Rising: 'bg-[color:var(--move-up)]/10 text-[color:var(--move-up)]',
  Falling: 'bg-[color:var(--move-down)]/10 text-[color:var(--move-down)]',
  New: 'bg-link/10 text-link',
  Dropped: 'bg-card text-subtle',
  Ad: 'bg-card text-muted',
  Stable: 'bg-card text-muted',
};
const STATUS_ICON = { Rising: '▲ ', Falling: '▼ ', New: '★ ', Dropped: '– ', Ad: '', Stable: '' };

const avgMoney = (v) => fmtMoney(Math.round(v));
const avgRating = (v) => v.toFixed(2);

function ProductCell({ r }) {
  return (
    <div className="flex max-w-[22rem] items-center gap-2 text-left">
      {r.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- marketplace CDNs, any host
        <img src={r.image} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md border border-divider bg-white object-contain" />
      ) : <span className="h-10 w-10 shrink-0 rounded-md border border-divider bg-card" />}
      <a href={r.link} target="_blank" rel="noopener noreferrer" title={r.title} className="line-clamp-2 whitespace-normal font-medium text-link hover:underline">
        {r.title}
        <ExternalLink size={11} className="ml-1 inline align-baseline opacity-60" />
      </a>
    </div>
  );
}

export function productColumns({ onDetails }) {
  return [
    {
      key: 'rank', label: 'Rank', numeric: true, sticky: true,
      description: 'Position in the marketplace’s search results today (ads left out) — 5 means it was the 5th product shown.',
      value: (r) => r.rank, text: (r) => fmtRank(r.rank),
      tone: (r) => (r.rank != null && r.rank <= 10 ? 'font-bold text-foreground' : 'font-semibold text-foreground'),
    },
    { key: 'page', label: 'Page', numeric: true, description: 'The result page it was found on today.',
      value: (r) => r.page, text: (r) => (r.page == null ? '-' : String(r.page)), tone: () => 'text-muted' },
    {
      key: 'title', label: 'Product', value: (r) => r.title, text: (r) => r.title, wrap: true,
      render: (r) => <ProductCell r={r} />,
    },
    {
      key: 'platform', label: 'Market Place', value: (r) => r.platform, text: (r) => r.platform,
      render: (r) => <PlatformBadge platform={r.platform} />,
    },
    { key: 'status', label: 'Status', value: (r) => r.status, text: (r) => r.status,
      description: 'Rising / Falling = moved 3+ places in a week · New = first seen in the last 7 days · Dropped = not in today’s results',
      render: (r) => <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[r.status] || ''}`}>{STATUS_ICON[r.status]}{r.status}</span> },
    { key: 'price', label: 'Price', numeric: true, value: (r) => r.price, text: (r) => fmtMoney(r.price), total: 'avg', totalFormat: avgMoney },
    { key: 'mrp', label: 'MRP', numeric: true, value: (r) => r.mrp, text: (r) => fmtMoney(r.mrp), tone: () => 'text-muted' },
    { key: 'discount', label: 'Discount', numeric: true, value: (r) => r.discount, text: (r) => fmtPct(r.discount) },
    { key: 'rating', label: 'Rating', numeric: true, value: (r) => r.rating, text: (r) => fmtRating(r.rating), total: 'avg', totalFormat: avgRating },
    { key: 'reviews', label: 'Reviews', numeric: true, value: (r) => r.reviews, text: (r) => fmtInt(r.reviews), total: 'sum', totalFormat: fmtInt,
      description: 'Ratings / reviews count the marketplace shows.' },
    { key: 'reviews7', label: 'Reviews +7 Days', numeric: true, value: (r) => r.reviewsGain.d7, text: (r) => fmtSigned(r.reviewsGain.d7), total: 'sum', totalFormat: (v) => fmtSigned(v),
      description: 'Reviews gained in the last 7 days — the best free signal of how fast it is selling.', tone: (r) => moveTone(r.reviewsGain.d7) },
    { key: 'bought', label: 'Bought / Month', numeric: true, value: (r) => r.bought, text: (r) => fmtBought(r.bought), total: 'sum', totalFormat: fmtBought,
      description: 'How many people bought it in the past month — Amazon’s own number (“1K+ bought in past month”), at least this many. Other market places don’t show it (-).',
      tone: (r) => (r.bought != null ? 'font-semibold text-foreground' : 'text-muted') },
    ...WINDOWS.map((w) => ({
      key: w.id, label: w.label, numeric: true,
      description: `Places moved since ${w.label.toLowerCase()} ago: ▲ climbed, ▼ fell. "-" = not tracked that far back yet.`,
      value: (r) => r.moves[w.id], text: (r) => fmtMove(r.moves[w.id]), tone: (r) => moveTone(r.moves[w.id]),
    })),
    { key: 'all', label: 'All Time', numeric: true, description: 'Places moved since it was first tracked.',
      value: (r) => r.all, text: (r) => fmtMove(r.all), tone: (r) => moveTone(r.all) },
    { key: 'best', label: 'Best Rank', numeric: true, value: (r) => r.bestRank, text: (r) => fmtRank(r.bestRank) },
    { key: 'days', label: 'Days Tracked', numeric: true, value: (r) => r.daysTracked, text: (r) => fmtInt(r.daysTracked) },
    { key: 'firstSeen', label: 'First Seen', value: (r) => r.firstSeen, text: (r) => fmtDay(r.firstSeen) },
    {
      key: 'details', label: 'Details', value: () => '', text: () => '',
      render: (r) => (
        <button type="button" onClick={() => onDetails(r.key)} className="inline-flex items-center gap-1 rounded-full bg-action px-3 py-1 text-xs font-semibold text-white hover:bg-action-hover">
          <BarChart3 size={13} /> Details
        </button>
      ),
    },
  ];
}

// The Daily History view — the sheet layout: Link, Date, Price, Review,
// Rating, Ranking, then rank moves vs that day's 1 Week / 15 Days / 1 Month /
// 3 Months / All Time.
export function dailyColumns({ showProduct = true } = {}) {
  return [
    ...(showProduct ? [
      { key: 'title', label: 'Link', value: (r) => r.title, text: (r) => r.title, wrap: true,
        render: (r) => <a href={r.link} target="_blank" rel="noopener noreferrer" title={r.link} className="line-clamp-2 max-w-[20rem] whitespace-normal text-left text-link hover:underline">{r.title}</a> },
      { key: 'platform', label: 'Market Place', value: (r) => r.platform, text: (r) => r.platform, render: (r) => <PlatformBadge platform={r.platform} /> },
    ] : []),
    { key: 'date', label: 'Date', value: (r) => r.date, text: (r) => fmtDay(r.date) },
    { key: 'price', label: 'Price', numeric: true, value: (r) => r.price, text: (r) => fmtMoney(r.price), total: 'avg', totalFormat: avgMoney },
    { key: 'reviews', label: 'Review', numeric: true, value: (r) => r.reviews, text: (r) => fmtInt(r.reviews) },
    { key: 'bought', label: 'Bought / Month', numeric: true, value: (r) => r.bought, text: (r) => fmtBought(r.bought), tone: (r) => (r.bought != null ? 'text-foreground' : 'text-muted') },
    { key: 'rating', label: 'Rating', numeric: true, value: (r) => r.rating, text: (r) => fmtRating(r.rating), total: 'avg', totalFormat: avgRating },
    { key: 'rank', label: 'Ranking', numeric: true, value: (r) => r.rank, text: (r) => (r.sponsored ? 'Ad' : fmtRank(r.rank)), tone: () => 'font-semibold text-foreground' },
    { key: 'page', label: 'Page', numeric: true, value: (r) => r.page, text: (r) => (r.page == null ? '-' : String(r.page)), tone: () => 'text-muted' },
    ...WINDOWS.map((w) => ({
      key: w.id, label: w.label, numeric: true, value: (r) => r.moves[w.id], text: (r) => fmtMove(r.moves[w.id]), tone: (r) => moveTone(r.moves[w.id]),
    })),
    { key: 'all', label: 'All Time', numeric: true, value: (r) => r.all, text: (r) => fmtMove(r.all), tone: (r) => moveTone(r.all) },
  ];
}
