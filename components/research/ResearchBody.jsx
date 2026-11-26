'use client';

import Link from 'next/link';
import { AlertTriangle, Layers, Loader2, Lock, MousePointerClick, Plus, Unlock } from 'lucide-react';
import { MAX_PICK } from '@/lib/research/myEntries';
import EmptyState, { NoProducts } from './EmptyState';
import { MY_ENTRIES_HREF } from './SearchPicker';
import LoadingPanel from './LoadingPanel';
import MarketplaceStatus from './MarketplaceStatus';
import PlatformBadge from './PlatformBadge';

// What the home page shows under its filters row, for every state — never
// an empty "no data" page while data is still coming in:
//   signed out                        → what the tool does + Log in
//   list loading / entries opening    → placeholders
//   no entries yet                    → the admin: add one · others: none yet
//   none saved on My Entries          → Add Entries
//   nothing ticked in Entries ▾       → pick some (the page opens this way)
//   every ticked entry locked         → an Unlock card each (first free, then coins)
//   none could open                   → why + Try again
//   read, but nothing found           → why (the admin can Search now)
//   ready                             → the locked ones (if some), status
//                                       line, then `children()`
export default function ResearchBody({ signedIn, r, v, children }) {
  const locked = r.lockedList || [];
  let body;
  if (!signedIn) body = <EmptyState signedIn={false} cost={r.cost} />;
  else if (!r.listReady) body = <LoadingPanel kind="list" />;
  else if (!r.allSearches.length) body = <EmptyState signedIn isAdmin={r.isAdmin} cost={r.cost} />;
  else if (!r.searches.length) {
    body = (
      <Prompt icon={Layers} title="Save the entries you work with" action>
        Add entries to your list on My Entries — then they show in Entries ▾ here, and you can tick several to see them together.
      </Prompt>
    );
  } else if (!r.picked.length) {
    body = (
      <Prompt icon={MousePointerClick} title="Pick entries to see their Daily History">
        Open <span className="font-semibold text-foreground">Pick entries ▾</span> above and tick one or more of your {r.searches.length} saved {r.searches.length === 1 ? 'entry' : 'entries'} — up to {MAX_PICK} together.
      </Prompt>
    );
  } else if (r.loading) body = <LoadingPanel kind="open" label={v.activeLabel} />;
  else if (!r.data && locked.length) {
    body = (
      <div className="flex flex-wrap justify-center gap-4">
        {locked.map((l) => <UnlockCard key={l.entry.id} r={r} info={l} />)}
      </div>
    );
  } else if (!r.data && r.openError) body = <OpenFailed r={r} />;
  else if (!r.data || r.data.search?.id !== r.activeId) body = <LoadingPanel kind="open" label={v.activeLabel} />;
  else if (!v.totalProducts) {
    body = (
      <>
        {locked.length > 0 && <LockedStrip r={r} locked={locked} />}
        <NoProducts data={r.data} isAdmin={r.isAdmin} />
      </>
    );
  } else {
    body = (
      <>
        {locked.length > 0 && <LockedStrip r={r} locked={locked} />}
        <MarketplaceStatus search={r.data.search} status={r.data.status} notice={r.notice} />
        {children()}
      </>
    );
  }
  return <div className="flex w-full flex-col gap-4 px-4 py-4 sm:px-6 lg:px-10">{body}</div>;
}

// A centred card that says what to do next; `action` adds the Add Entries button.
function Prompt({ icon: Icon, title, children, action = false }) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl border border-divider bg-background p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-card"><Icon size={20} className="text-accent" /></span>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted">{children}</p>
      {action && (
        <Link href={MY_ENTRIES_HREF} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-hover">
          <Plus size={15} /> Add Entries
        </Link>
      )}
    </div>
  );
}

// Free, or what it costs — the user's free unlocks left come from the list
// (refreshed after every unlock), so a second card doesn't still say "free".
function priceOf(r, info) {
  const left = r.cost?.freeLeft ?? info.freeLeft;
  const free = !info.coinsPerUnlock || left > 0;
  return { free, label: free ? 'Unlock free' : `Unlock for ${info.coinsPerUnlock} coins` };
}

// An entry this user hasn't unlocked: what it is, what unlocking costs.
function UnlockCard({ r, info }) {
  const { entry, coinsPerUnlock } = info;
  const { free, label } = priceOf(r, info);
  const busy = r.unlocking === entry.id;
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl border border-divider bg-background p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-card"><Lock size={20} className="text-accent" /></span>
      <h2 className="text-lg font-semibold text-foreground">{entry.name}</h2>
      <div className="flex items-center gap-2 text-sm text-muted">
        {entry.platform && entry.platform !== 'mixed' && <PlatformBadge platform={entry.platform} />}
        {entry.category}
      </div>
      <p className="text-sm text-muted">
        Unlock it once to see every product’s daily rank, price, rating, reviews and bought count — and it stays yours.
        {free ? ' This one is free (your first unlock).' : ` It costs ${coinsPerUnlock} coins, once.`}
      </p>
      <button
        type="button"
        onClick={() => r.unlock(entry.id)}
        disabled={!!r.unlocking}
        className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Unlock size={15} />}
        {busy ? 'Unlocking…' : label}
      </button>
    </div>
  );
}

// Some ticked entries show, these aren't unlocked yet — so they aren't in
// the table. One small Unlock button each.
function LockedStrip({ r, locked }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-divider bg-background px-3 py-2 text-xs text-muted">
      <Lock size={13} className="text-accent" />
      <span>Not in the table until unlocked:</span>
      {locked.map((l) => {
        const busy = r.unlocking === l.entry.id;
        return (
          <span key={l.entry.id} className="inline-flex items-center gap-1.5 rounded-full border border-divider-light py-0.5 pl-2.5 pr-0.5">
            <span className="font-semibold text-foreground">{l.entry.name}</span>
            <button type="button" onClick={() => r.unlock(l.entry.id)} disabled={!!r.unlocking} className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-accent-hover disabled:opacity-60">
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Unlock size={11} />}
              {busy ? 'Unlocking…' : priceOf(r, l).label}
            </button>
          </span>
        );
      })}
    </div>
  );
}

// None of the ticked entries could open (the server or the network).
function OpenFailed({ r }) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl border border-divider bg-background p-6 text-center">
      <AlertTriangle size={22} className="text-[color:var(--move-down)]" />
      <h2 className="text-lg font-semibold text-foreground">This couldn’t open</h2>
      <p className="text-sm text-muted">{r.openError}</p>
      <button type="button" onClick={() => r.pick(r.picked)} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-hover">Try again</button>
    </div>
  );
}
