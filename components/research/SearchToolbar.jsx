'use client';

import { useState } from 'react';
import { ChevronDown, FileUp, Link2, Loader2, Plus, Search, Store, Tags, X } from 'lucide-react';
import Popover from '@/components/dashboard/Popover';
import SearchChecklist from '@/components/dashboard/SearchChecklist';
import { FileIconButton } from '@/components/dashboard/IconButton';
import { DEFAULT_RANGE, MARKETPLACES, MAX_PAGE, MAX_SPAN, MAX_URLS, readListingUrl } from '@/data/marketplaces';
import { CATEGORY_SUGGESTIONS } from '@/data/categories';
import PlatformBadge from './PlatformBadge';

const PAGE_NUMBERS = Array.from({ length: MAX_PAGE }, (_, i) => i + 1);
const SELECT = 'rounded-md bg-card px-1 py-0.5 font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-accent';
const INPUT = 'h-9 w-full rounded-full border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-subtle focus:outline-none';
const MODES = [
  { id: 'category', label: 'Category', icon: Tags, hint: 'A category or keyword, on the market places you pick' },
  { id: 'url', label: 'URL', icon: Link2, hint: 'Links to category or search pages you already use — the market place is read from each link' },
];

// The search row. First the kind of search:
//   Category — a category / keyword → Market Places → Pages From … To.
//   URL      — up to MAX_URLS listing links (a category page, a filtered
//              search, a brand store) → Pages From … To. Each link is checked
//              as it is typed (readListingUrl): its market place shows, or why
//              it can't be read (a single product's page, another site).
// Then Search (it says what it costs: "Free" first, then the coin price)
// and Import Sheet. The page range can never be wrong: moving From past To
// moves To with it, and more than MAX_SPAN pages pulls the other end in.
export default function SearchToolbar({ onSearch, onImport, busy, cost, signedIn }) {
  const [mode, setMode] = useState('category');
  const [query, setQuery] = useState('');
  const [platforms, setPlatforms] = useState(MARKETPLACES.map((m) => m.id));
  const [links, setLinks] = useState(['']);
  const [fromPage, setFromPage] = useState(DEFAULT_RANGE.fromPage);
  const [toPage, setToPage] = useState(DEFAULT_RANGE.toPage);
  const pickFrom = (n) => {
    setFromPage(n);
    if (toPage < n) setToPage(n);
    else if (toPage - n + 1 > MAX_SPAN) setToPage(n + MAX_SPAN - 1);
  };
  const pickTo = (n) => {
    setToPage(n);
    if (fromPage > n) setFromPage(n);
    else if (n - fromPage + 1 > MAX_SPAN) setFromPage(n - MAX_SPAN + 1);
  };
  const count = toPage - fromPage + 1;

  const checked = links.map((l) => (l.trim() ? readListingUrl(l) : null));
  const goodLinks = checked.filter((c) => c?.url);
  const badLink = checked.some((c) => c?.error);
  const ready = mode === 'url' ? goodLinks.length > 0 && !badLink : query.trim().length >= 2 && platforms.length > 0;

  const submit = (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    if (mode === 'url') onSearch({ mode: 'url', urls: goodLinks.map((c) => c.url), fromPage, toPage });
    else onSearch({ mode: 'category', query: query.trim(), platforms, fromPage, toPage });
  };
  const setLink = (i, v) => setLinks((cur) => cur.map((l, j) => (j === i ? v : l)));
  const picked = platforms.length === MARKETPLACES.length ? 'All Market Places' : platforms.length === 1 ? MARKETPLACES.find((m) => m.id === platforms[0])?.name : `${platforms.length} Market Places`;
  const badge = !signedIn ? null : cost?.freeLeft > 0 ? 'Free' : cost?.coinsPerSearch ? `${cost.coinsPerSearch} coins` : null;

  const modeSwitch = (
    <div role="radiogroup" aria-label="Search by" className="inline-flex h-9 items-center rounded-full border border-divider-light bg-background p-0.5">
      {MODES.map(({ id, label, icon: Icon, hint }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={mode === id}
          title={hint}
          onClick={() => setMode(id)}
          className={`inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors ${mode === id ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}
        >
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  );

  const pageRange = (
    <div
      role="group"
      aria-label="Result pages to read"
      title={`Reads result pages ${fromPage} to ${toPage} of each ${mode === 'url' ? 'link' : 'market place'} (${count} page${count === 1 ? '' : 's'}, at most ${MAX_SPAN}). More pages = more products ranked, and a slower search.`}
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
      <span className="hidden text-[11px] text-subtle sm:inline">({count} page{count === 1 ? '' : 's'})</span>
    </div>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {modeSwitch}

        {mode === 'category' ? (
          <>
            <label className="relative min-w-[14rem] flex-1 sm:max-w-md">
              <span className="sr-only">Category or keyword</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={80}
                list="category-suggestions"
                placeholder="Category or keyword — e.g. cotton kurti, wireless earbuds"
                className={`${INPUT} border-divider-light focus:border-accent`}
              />
              <datalist id="category-suggestions">
                {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </label>

            <Popover
              align="left"
              panelClass="p-1"
              trigger={() => (
                <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-action px-3 text-sm font-semibold text-white hover:bg-action-hover">
                  <Store size={15} />
                  <span className="max-w-[10rem] truncate">{picked}</span>
                  <ChevronDown size={13} />
                </button>
              )}
            >
              {(close) => (
                <SearchChecklist
                  label="market places"
                  options={MARKETPLACES.map((m) => ({ value: m.id, label: m.name }))}
                  initial={platforms}
                  onSubmit={(values) => setPlatforms(values.length ? values : platforms)}
                  onClose={close}
                  placeholder="Search market places…"
                />
              )}
            </Popover>
          </>
        ) : (
          <span className="min-w-[12rem] flex-1 text-xs text-muted">Paste category or search page links below — the market place is read from each link.</span>
        )}

        {pageRange}

        <button
          type="submit"
          disabled={busy || !ready}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-45"
          title={badge === 'Free' ? 'Your first search is free' : badge ? `Each new search costs ${badge} — reopening one you already track is free` : 'Search'}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          {busy ? 'Searching…' : 'Search'}
          {badge && !busy && <span className="rounded-full bg-white/20 px-1.5 text-[10px] font-bold leading-4">{badge}</span>}
        </button>

        <span className="mx-1 hidden h-6 w-px bg-divider sm:block" />
        <FileIconButton
          icon={FileUp}
          label="Import Sheet"
          title="Import a product sheet you already have — columns Link, Date, Price, Review, Rating, Ranking (free)"
          accept=".xlsx,.xls,.csv"
          multiple={false}
          tone="outline"
          onFiles={(f) => onImport(f[0])}
          disabled={busy}
        />
      </div>

      {mode === 'url' && (
        <div className="flex flex-col gap-1.5">
          {links.map((link, i) => {
            const c = checked[i];
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <label className="relative min-w-[16rem] flex-1">
                  <span className="sr-only">Link {i + 1}</span>
                  <Link2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                  <input
                    value={link}
                    onChange={(e) => setLink(i, e.target.value)}
                    inputMode="url"
                    placeholder="https://www.flipkart.com/… — a category or search results page"
                    aria-invalid={!!c?.error}
                    className={`${INPUT} ${c?.error ? 'border-neg' : 'border-divider-light focus:border-accent'}`}
                  />
                </label>
                {c?.url && <PlatformBadge platform={c.platform} />}
                {c?.error && <span className="text-xs text-neg">{c.error}</span>}
                {links.length > 1 && (
                  <button type="button" onClick={() => setLinks((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove link ${i + 1}`} className="rounded-full p-1.5 text-subtle hover:bg-card-hover hover:text-neg">
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}
          {links.length < MAX_URLS && (
            <button type="button" onClick={() => setLinks((cur) => [...cur, ''])} className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-link hover:bg-link/10">
              <Plus size={13} /> Add another link ({links.length} of {MAX_URLS})
            </button>
          )}
        </div>
      )}
    </form>
  );
}
