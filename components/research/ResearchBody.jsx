'use client';

import Link from 'next/link';
import { AlertTriangle, Layers, Loader2, Lock, MousePointerClick, Plus, RefreshCw } from 'lucide-react';
import { MAX_PICK } from '@/lib/research/myEntries';
import EmptyState, { NoProducts } from './EmptyState';
import { MY_ENTRIES_HREF } from './SearchPicker';
import { coinsText, longDay } from './EntryBillingModals';
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
//   every ticked entry expired        → a Renew card each (a month, in coins)
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
        Add categories to your list on Product Categories — then they show in Entries ▾ here, and you can tick several to see them together.
      </Prompt>
    );
  } else if (!r.picked.length) {
    body = (
      <Prompt icon={MousePointerClick} title="Pick categories to see their Daily History">
        Open <span className="font-semibold text-foreground">Pick Categories ▾</span> above and tick one or more of your {r.searches.length} saved {r.searches.length === 1 ? 'entry' : 'entries'} — up to {MAX_PICK} together.
      </Prompt>
    );
  } else if (r.loading) body = <LoadingPanel kind="open" label={v.activeLabel} />;
  else if (!r.data && locked.length) {
    body = (
      <div className="flex flex-wrap justify-center gap-4">
        {locked.map((l) => <RenewCard key={l.entry.id} r={r} info={l} />)}
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
          <Plus size={15} /> Add Categories
        </Link>
      )}
    </div>
  );
}

// A ticked entry whose month isn't paid → Renew (Expired) or Add (never
// paid) — through the confirm window (lib/research/useEntryBilling.js).
const payFor = (r, l) => {
  const entry = { ...l.entry, status: l.planStatus, paidUntil: l.paidUntil };
  return l.planStatus === 'expired' ? () => r.billing.askRenew([entry]) : () => r.billing.askAdd([entry]);
};
const payLabel = (r, l) => {
  const price = r.cost?.coinsPerMonth || 0;
  const verb = l.planStatus === 'expired' ? 'Renew' : 'Add';
  return price ? `${verb} · ${coinsText(price)} / month` : verb;
};

// An entry whose month ran out: what it is, when it expired, Renew.
function RenewCard({ r, info }) {
  const { entry } = info;
  const expired = info.planStatus === 'expired';
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl border border-divider bg-background p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-card"><Lock size={20} className="text-accent" /></span>
      <h2 className="text-lg font-semibold text-foreground">{entry.name}</h2>
      <div className="flex items-center gap-2 text-sm text-muted">
        {entry.platform && entry.platform !== 'mixed' && <PlatformBadge platform={entry.platform} />}
        {entry.category}
      </div>
      <p className="text-sm text-muted">
        {expired ? `Its month ended on ${longDay(info.paidUntil)}.` : 'It isn’t paid for yet.'} Each entry is paid a month at a time — every product’s daily rank, price, rating, reviews and bought count, for a month, renewing by itself.
      </p>
      <button
        type="button"
        onClick={payFor(r, info)}
        disabled={r.billing.busy}
        className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
      >
        {r.billing.busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        {payLabel(r, info)}
      </button>
    </div>
  );
}

// Some ticked entries show; these aren't paid now — so they aren't in the
// table. One small Renew button each.
function LockedStrip({ r, locked }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-divider bg-background px-3 py-2 text-xs text-muted">
      <Lock size={13} className="text-accent" />
      <span>Expired — not in the table until renewed:</span>
      {locked.map((l) => (
        <span key={l.entry.id} className="inline-flex items-center gap-1.5 rounded-full border border-divider-light py-0.5 pl-2.5 pr-0.5">
          <span className="font-semibold text-foreground">{l.entry.name}</span>
          <button type="button" onClick={payFor(r, l)} disabled={r.billing.busy} className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-accent-hover disabled:opacity-60">
            <RefreshCw size={11} /> {payLabel(r, l)}
          </button>
        </span>
      ))}
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
