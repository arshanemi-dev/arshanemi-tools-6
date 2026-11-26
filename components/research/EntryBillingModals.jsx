'use client';

import { CalendarClock, Coins, Loader2, Trash2 } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import BillingGateModal from '@/components/billing/BillingGateModal';
import { fmtInt } from '@/lib/research/format';

// The windows of lib/research/useEntryBilling.js — `b` = that hook:
//   confirm   "Add 2 entries? Pay 10,000 coins" / "Renew …" / "Remove …"
//   receipt   "Coins used — 10,000 · paid till 26 Dec 2026 · 2,000 left"
//   gate      not enough coins / coins expired / … (the hub's own windows)
export const coinsText = (n) => `${fmtInt(n)} coin${n === 1 ? '' : 's'}`;
export const longDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

const names = (entries) => (entries.length <= 3 ? entries.map((e) => e.name).join(', ') : `${entries.slice(0, 2).map((e) => e.name).join(', ')} + ${entries.length - 2} more`);

function ConfirmWindow({ b }) {
  const c = b.confirm;
  if (!c) return null;
  const remove = c.kind === 'remove';
  const n = c.entries.length;
  const free = c.entries.length - c.pay.length;
  const title = remove ? `Remove ${n === 1 ? 'this entry' : `${n} entries`}?` : c.kind === 'renew' ? `Renew ${n === 1 ? 'this entry' : `${n} entries`}?` : `Add ${n === 1 ? 'this entry' : `${n} entries`}?`;
  return (
    <Modal
      open
      onClose={b.busy ? () => {} : b.cancel}
      title={title}
      maxWidth="max-w-md"
      footer={(
        <>
          <button type="button" onClick={b.cancel} disabled={b.busy} className="h-9 flex-1 rounded-lg border border-divider-light text-sm font-medium text-muted hover:bg-card-hover disabled:opacity-50">Cancel</button>
          <button
            type="button"
            onClick={b.runConfirm}
            disabled={b.busy}
            className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60 ${remove ? 'bg-neg hover:opacity-90' : 'bg-accent hover:bg-accent-hover'}`}
          >
            {b.busy ? <Loader2 size={15} className="animate-spin" /> : remove ? <Trash2 size={15} /> : <Coins size={15} />}
            {b.busy ? 'One moment…' : remove ? 'Remove' : `Pay ${coinsText(c.coins)}`}
          </button>
        </>
      )}
    >
      <p className="text-sm font-semibold text-foreground">{names(c.entries)}</p>
      {remove ? (
        <p className="text-sm text-muted">
          {n === 1 ? 'It stops' : 'They stop'} renewing — no more monthly charges. A month already paid isn’t refunded: {n === 1 ? 'it stays' : 'they stay'} viewable until it ends, and adding {n === 1 ? 'it' : 'them'} back before then costs nothing.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-xl border border-divider bg-background px-4 py-3">
            <Coins size={20} className="shrink-0 text-accent" />
            <div className="text-sm text-muted">
              <span className="text-lg font-bold text-foreground">{coinsText(c.coins)}</span> now
              <span className="block text-xs">{coinsText(b.price)} per entry · one month, till {longDay(c.until)}</span>
            </div>
          </div>
          {free > 0 && <p className="text-xs text-muted">{free} of them {free === 1 ? 'is' : 'are'} still inside a month already paid — no charge for {free === 1 ? 'it' : 'them'}.</p>}
          <p className="flex items-start gap-1.5 text-xs text-subtle">
            <CalendarClock size={13} className="mt-0.5 shrink-0" />
            Every month it renews by itself — {coinsText(b.price)} per entry is taken from your wallet. Not enough coins → the entry turns Expired (you’re never charged into minus). Remove an entry on Product Categories to stop.
          </p>
        </>
      )}
    </Modal>
  );
}

function ReceiptWindow({ b }) {
  const r = b.receipt;
  if (!r) return null;
  return (
    <Modal
      open
      onClose={b.closeReceipt}
      title={r.title}
      maxWidth="max-w-sm"
      footer={<button type="button" onClick={b.closeReceipt} className="h-9 flex-1 rounded-lg bg-accent text-sm font-semibold text-white hover:bg-accent-hover">OK</button>}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-divider bg-surface"><Coins size={20} className="text-accent" /></span>
        <p className="text-2xl font-bold tabular-nums text-foreground">−{coinsText(r.coins)}</p>
        {Number.isFinite(r.remainingCoins) && <p className="text-xs text-muted">Wallet: <span className="font-semibold text-foreground">{coinsText(r.remainingCoins)}</span> left</p>}
      </div>
      <ul className="flex flex-col gap-1 rounded-xl border border-divider bg-background p-3 text-sm">
        {r.lines.map((l) => (
          <li key={l.name} className="flex items-center justify-between gap-3">
            <span className="truncate font-semibold text-foreground">{l.name}</span>
            <span className="shrink-0 text-xs text-muted">paid till {longDay(l.paidUntil)}</span>
          </li>
        ))}
      </ul>
      {r.note && <p className="text-xs text-[color:var(--move-down)]">{r.note}</p>}
      <p className="text-xs text-subtle">Renews by itself every month while it’s on your list. Remove it on Product Categories to stop.</p>
    </Modal>
  );
}

export default function EntryBillingModals({ b }) {
  return (
    <>
      <ConfirmWindow b={b} />
      <ReceiptWindow b={b} />
      <BillingGateModal gate={b.gate} onClose={b.closeGate} onRetry={b.retry} />
    </>
  );
}
