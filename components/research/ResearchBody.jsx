'use client';

import { Loader2, Lock, Unlock } from 'lucide-react';
import EmptyState, { NoProducts } from './EmptyState';
import LoadingPanel from './LoadingPanel';
import MarketplaceStatus from './MarketplaceStatus';
import PlatformBadge from './PlatformBadge';

// What the home page shows under its filters row, for every state — never
// an empty "no data" page while data is still coming in:
//   signed out                      → what the tool does + Log in
//   list loading / an entry opening → placeholders
//   no entries yet                  → the admin: add one · others: none yet
//   entry not unlocked              → Unlock card (first free, then coins)
//   read, but nothing found         → why (the admin can Search now)
//   ready                           → status line, then `children()`
export default function ResearchBody({ signedIn, r, v, children }) {
  let body;
  if (!signedIn) body = <EmptyState signedIn={false} cost={r.cost} />;
  else if (!r.listReady) body = <LoadingPanel kind="list" />;
  else if (!r.searches.length) body = <EmptyState signedIn isAdmin={r.isAdmin} cost={r.cost} />;
  else if (r.loading) body = <LoadingPanel kind="open" label={v.activeLabel} />;
  else if (r.locked) body = <UnlockCard r={r} />;
  else if (!r.data || r.data.search?.id !== r.activeId) body = <LoadingPanel kind="open" label={v.activeLabel} />;
  else if (!v.totalProducts) body = <NoProducts data={r.data} isAdmin={r.isAdmin} />;
  else {
    body = (
      <>
        <MarketplaceStatus search={r.data.search} status={r.data.status} notice={r.notice} />
        {children()}
      </>
    );
  }
  return <div className="flex w-full flex-col gap-4 px-4 py-4 sm:px-6 lg:px-10">{body}</div>;
}

// An entry this user hasn't unlocked: what it is, what unlocking costs.
function UnlockCard({ r }) {
  const { entry, coinsPerUnlock, freeLeft } = r.locked;
  const free = freeLeft > 0 || !coinsPerUnlock;
  const busy = r.busy === 'unlock';
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl border border-divider bg-background p-6 text-center">
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
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Unlock size={15} />}
        {busy ? 'Unlocking…' : free ? 'Unlock free' : `Unlock for ${coinsPerUnlock} coins`}
      </button>
    </div>
  );
}
