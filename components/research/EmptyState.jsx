'use client';

import { AlertTriangle, BarChart3, CalendarClock, Coins, LogIn, RefreshCw, Search, Trophy } from 'lucide-react';
import { redirectToLogin } from '@/lib/authGate';
import { fmtDay } from '@/lib/research/format';
import PlatformBadge from './PlatformBadge';

// What the page shows before there's a search to show: what the tool does,
// what it costs, and (signed out) the way in.
const STEPS = [
  { icon: Search, title: 'Search a category or a link', body: 'Type a category and pick the market places — Amazon, Flipkart, Meesho, Myntra, Snapdeal — or paste links to category pages you already use. Every product on the pages you choose is read.' },
  { icon: Trophy, title: 'See who ranks', body: 'Each product gets its Rank — the 5th product shown is rank 5 — with price, MRP, discount, rating and review count.' },
  { icon: CalendarClock, title: 'Tracked every day', body: 'Your searches are read again daily, so each product builds a history: rank moves over 1 week, 15 days, 1 month, 3 months and all time.' },
  { icon: BarChart3, title: 'Compare on graphs', body: 'Ranking, Review, Rating and Price graphs for any products you tick, plus a Details view per product. Filter, sort, and download to Excel or PDF.' },
];

export default function EmptyState({ signedIn, cost }) {
  const price = cost?.coinsPerSearch;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Find the best-selling products in any category</h1>
        <p className="mt-1 text-sm text-muted">
          {signedIn ? 'Pick Category or URL above, then press Search to start.' : 'Sign in, then type a category (or paste a link) above and press Search.'}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-2xl border border-divider bg-background p-4">
            <Icon size={20} className="text-accent" />
            <h2 className="mt-2 text-sm font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-divider bg-background px-4 py-3 text-sm text-muted">
        <Coins size={16} className="text-accent" />
        <span>Your <strong className="text-foreground">first search is free</strong>{price ? <> · each new search after that is <strong className="text-foreground">{price} coins</strong></> : ' · each new search after that costs coins'} · refreshing, graphs, Details and downloads are always free · <strong className="text-foreground">Import Sheet</strong> is free.</span>
        {!signedIn && (
          <button type="button" onClick={redirectToLogin} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover">
            <LogIn size={14} /> Log in
          </button>
        )}
      </div>
    </div>
  );
}

// An open search with no products at all, once the reading has finished —
// says why, per market place / link, instead of an empty table.
export function NoProducts({ data, notice = [], onRefresh }) {
  const isImport = data?.search?.kind === 'import';
  const status = data?.status || [];
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-divider bg-background p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle size={18} className="text-[color:var(--move-down)]" />
        <h2 className="text-base font-semibold text-foreground">No products could be read for “{data?.search?.query}” yet</h2>
      </div>
      {status.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-sm">
          {status.map((s) => (
            <li key={s.id || s.platform} className="flex flex-wrap items-center gap-2">
              <PlatformBadge platform={s.platform} />
              {s.label?.includes(' · ') && <span className="text-xs text-muted">{s.label.split(' · ').slice(1).join(' · ')}</span>}
              <span className="text-xs text-muted">
                {s.lastRun?.error ? s.lastRun.error : s.lastRunDate ? `0 products on ${fmtDay(s.lastRunDate)}` : 'not read yet'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        notice.length > 0 && <ul className="list-disc pl-5 text-xs text-muted">{notice.map((n) => <li key={n}>{n}</li>)}</ul>
      )}
      <p className="text-xs text-subtle">
        {isImport
          ? 'The sheet had no rows this tool could use — import it again with Link and Date columns.'
          : 'Market places sometimes block a read for a while. Try again in a few minutes — reading again is free. It is also read again automatically every day.'}
      </p>
      {!isImport && (
        <button type="button" onClick={onRefresh} className="inline-flex w-fit items-center gap-1.5 rounded-full bg-action px-4 py-1.5 text-sm font-semibold text-white hover:bg-action-hover">
          <RefreshCw size={14} /> Try again now
        </button>
      )}
    </div>
  );
}
