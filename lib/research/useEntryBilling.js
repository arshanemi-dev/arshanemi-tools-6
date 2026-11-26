'use client';

import { useCallback, useRef, useState } from 'react';
import { addMyEntries, removeMyEntries, renewMyEntries } from './apiClient';
import { addMonth } from './plans';
import { track } from '@/lib/embedBridge';

// Paying for entries, the same way on Product Research and My Entries
// (data/billing.js). Draw it with <EntryBillingModals b={…} />.
//   askAdd(entries)    add to my list — the ones not paid right now cost a
//                      month each: a confirm window first, then the charge
//   askRenew(entries)  Expired ones, a month each — confirm, then charge
//   askRemove(entries) take off my list (they stop renewing) — confirm
//   autoRenew(names)   the monthly renewal of the saved ones whose month ran
//                      out — no confirm (they were added to renew monthly);
//                      `names` = id → name, for the windows
// After a charge the "Coins used" window says what was paid, until when, and
// what's left in the wallet; a refusal (too few coins, coins expired, …)
// shows the hub's own coins window (BillingGateModal), like every tool.
// `entries` = [{ id, name, status, paidUntil }]; `price` = coins a month for
// one entry (0 = free: nothing to confirm); `onChanged()` reloads the page.
const newRequestId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
const nameOf = (entries, id) => entries.find((e) => e.id === id)?.name || id;

export function useEntryBilling({ addToast, price = 0, onChanged }) {
  const [confirm, setConfirm] = useState(null); // { kind, entries, pay, coins, requestId }
  const [receipt, setReceiptState] = useState(null); // { title, coins, remainingCoins, lines, note }
  const [gate, setGateState] = useState(null);  // { reason, data } for BillingGateModal
  const [busy, setBusy] = useState(false);
  const last = useRef(null);                    // the action a "Try again" repeats

  // The windows, with the same usage events the other tools send.
  const setReceipt = useCallback((r) => {
    setReceiptState(r);
    if (r?.coins) track('tool_used', { feature: 'entry-month', coins: r.coins, entries: r.lines.length });
  }, []);
  const setGate = useCallback((g) => {
    setGateState(g);
    if (g) track('tool_limit_reached', { feature: 'entry-month', reason: g.reason });
  }, []);

  // Renewal answers → the windows. `title` = what the receipt is called.
  const showRenewal = useCallback((data, names, { title, auto }) => {
    const renewed = data.renewed || [];
    const lapsed = (data.lapsed || []).map((id) => names(id));
    if (renewed.length) {
      setReceipt({
        title,
        coins: data.coins || 0,
        remainingCoins: data.remainingCoins,
        lines: renewed.map((r) => ({ name: names(r.id), paidUntil: r.paidUntil })),
        note: data.blocked ? `${lapsed.length || 'Some'} couldn’t be renewed — ${lapsed.length ? `${lapsed.join(', ')} ${lapsed.length === 1 ? 'is' : 'are'} Expired now. ` : ''}Add coins, then press Renew.` : null,
      });
    } else if (data.blocked) {
      setGate({
        reason: data.blocked.reason,
        data: {
          ...data.blocked.data,
          note: auto && lapsed.length
            ? `Your monthly renewal for ${lapsed.join(', ')} couldn’t be paid, so ${lapsed.length === 1 ? 'it is' : 'they are'} Expired now. Add coins, then press Renew on Product Categories.`
            : 'Nothing was renewed. Add coins and try again.',
        },
      });
    }
    if (data.error) addToast(data.error, 'error');
  }, [addToast, setReceipt, setGate]);

  const run = useCallback(async (c) => {
    last.current = c;
    setBusy(true);
    const ids = c.entries.map((e) => e.id);
    let res;
    if (c.kind === 'add') res = await addMyEntries(ids, c.requestId);
    else if (c.kind === 'renew') res = await renewMyEntries(ids);
    else res = await removeMyEntries(ids);
    setBusy(false);
    setConfirm(null);
    if (!res.ok) {
      if (res.status === 401) return false;
      if (res.status === 402 && res.data?.status === 'blocked') { setGate({ reason: res.data.reason, data: res.data.data }); return false; }
      addToast(res.data?.error || 'That didn’t go through — try again.', 'error');
      return false;
    }
    if (c.kind === 'add') {
      const ch = res.data.charged || {};
      const until = addMonth(Date.now());
      if (ch.coins > 0) {
        setReceipt({
          title: 'Coins used',
          coins: ch.coins,
          remainingCoins: ch.remainingCoins,
          lines: (ch.entries || []).map((id) => ({ name: nameOf(c.entries, id), paidUntil: until })),
          note: c.entries.length > (ch.entries || []).length ? 'The others were still inside a month already paid — no charge for them.' : null,
        });
      } else addToast(`${ids.length === 1 ? c.entries[0].name : `${ids.length} entries`} added`);
    } else if (c.kind === 'renew') {
      showRenewal(res.data, (id) => nameOf(c.entries, id), { title: 'Coins used — renewed', auto: false });
    } else {
      addToast(`${ids.length === 1 ? c.entries[0].name : `${ids.length} entries`} removed — no more monthly charges${c.entries.some((e) => e.status === 'active') ? ' (viewable until the paid month ends)' : ''}`);
    }
    onChanged?.();
    return true;
  }, [addToast, onChanged, showRenewal, setReceipt, setGate]);

  // Ask first when it costs coins; free (the master admin, billing off,
  // or nothing to pay) goes straight through.
  const ask = useCallback((kind, entries) => {
    if (!entries.length) return;
    const pay = kind === 'remove' ? [] : kind === 'renew' ? entries : entries.filter((e) => e.status !== 'active');
    // `until` = the end of the month being paid for (shown in the window).
    const c = { kind, entries, pay, coins: price * pay.length, requestId: newRequestId(), until: addMonth(Date.now()) };
    if (kind !== 'remove' && !c.coins) { run(c); return; }
    setConfirm(c);
  }, [price, run]);

  const autoRenew = useCallback(async (names) => {
    const res = await renewMyEntries();
    if (!res.ok) return; // tried again on the next visit
    showRenewal(res.data, (id) => names[id] || id, { title: 'Monthly renewal — coins used', auto: true });
    if (res.data.renewed?.length || res.data.lapsed?.length) onChanged?.();
  }, [onChanged, showRenewal]);

  return {
    confirm, receipt, gate, busy, price,
    askAdd: (entries) => ask('add', entries),
    askRenew: (entries) => ask('renew', entries),
    askRemove: (entries) => ask('remove', entries),
    autoRenew,
    runConfirm: () => confirm && run(confirm),
    cancel: () => setConfirm(null),
    closeReceipt: () => setReceiptState(null),
    closeGate: () => setGateState(null),
    retry: () => { setGateState(null); if (last.current) run(last.current); },
  };
}
