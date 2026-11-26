'use client';

import { AlertTriangle, BarChart3, CalendarClock, Coins, Layers, LogIn, Search, Trophy } from 'lucide-react';
import Link from 'next/link';
import { redirectToLogin } from '@/lib/authGate';
import { fmtDay, fmtInt } from '@/lib/research/format';
import PlatformBadge from './PlatformBadge';

// What the home page shows before there's an entry to show: what the tool
// does, what it costs, and (signed out) the way in. The master admin is
// pointed to New Search, where entries are added.
const STEPS = [
  { icon: Layers, title: 'Pick an entry', body: 'Each entry is one market place + category — like flipkart_cotton-kurti — read from its category or search page, every product on the pages chosen.' },
  { icon: Trophy, title: 'See who ranks', body: 'Each product gets its Rank — the 5th product shown is rank 5 — with price, MRP, rating, reviews and how many bought it.' },
  { icon: CalendarClock, title: 'Tracked every day', body: 'Entries are read again daily, so every product builds a history: rank moves over 1 week, 15 days, 1 month, 3 months and all time.' },
  { icon: BarChart3, title: 'Download it', body: 'Filter by date, sort and filter every column, and download the Daily History to Excel or PDF.' },
];

export default function EmptyState({ signedIn, isAdmin = false, cost }) {
  const price = cost?.coinsPerMonth;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Find the best-selling products in any category</h1>
        <p className="mt-1 text-sm text-muted">
          {!signedIn
            ? 'Log in to use Product Research — an account is needed.'
            : isAdmin
              ? 'No entries yet — add the first one on the New Search page.'
              : 'No categories are tracked yet — check back soon.'}
        </p>
        {signedIn && isAdmin && (
          <Link href="/product-research/new-search" className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-hover">
            <Search size={15} /> Add an entry
          </Link>
        )}
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
      {!isAdmin && (
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-divider bg-background px-4 py-3 text-sm text-muted">
          <Coins size={16} className="text-accent" />
          <span>Each entry is paid <strong className="text-foreground">a month at a time</strong>{price ? <> — <strong className="text-foreground">{fmtInt(price)} coins</strong> per entry / month</> : ' in coins'}, renewing by itself from your wallet · filters and downloads are included.</span>
          {!signedIn && (
            <button type="button" onClick={redirectToLogin} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover">
              <LogIn size={14} /> Log in
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// An entry with no products at all — says why instead of an empty table.
export function NoProducts({ data, isAdmin = false }) {
  const isImport = data?.search?.kind === 'import';
  const status = data?.status || [];
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-divider bg-background p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle size={18} className="text-[color:var(--move-down)]" />
        <h2 className="text-base font-semibold text-foreground">No products for “{data?.search?.query}” yet</h2>
      </div>
      {status.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {status.map((s) => (
            <li key={s.id || s.platform} className="flex flex-wrap items-center gap-2">
              {s.platform !== 'mixed' && <PlatformBadge platform={s.platform} />}
              <span className="text-xs text-muted">
                {s.lastRun?.error ? s.lastRun.error : s.lastRunDate ? `0 products on ${fmtDay(s.lastRunDate)}` : 'not read yet'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-subtle">
        {isImport
          ? 'The sheet had no rows this tool could use.'
          : isAdmin
            ? 'Read it now from the New Search page (Search now) — market places sometimes block a read for a while.'
            : 'It hasn’t been read yet — check back a little later.'}
      </p>
      {isAdmin && !isImport && (
        <Link href="/product-research/new-search" className="inline-flex w-fit items-center gap-1.5 rounded-full bg-action px-4 py-1.5 text-sm font-semibold text-white hover:bg-action-hover">
          <Search size={14} /> Go to New Search
        </Link>
      )}
    </div>
  );
}
