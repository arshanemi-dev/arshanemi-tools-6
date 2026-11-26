'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getEntry, listEntries, unlockEntry } from './apiClient';
import { combineEntries, listedEntries, MAX_PICK } from './myEntries';
import { track } from '@/lib/embedBridge';

// The home page's data layer: every entry the master admin added, the
// entries ticked in Entries ▾ (several at once), their data together, and
// unlocking. → state + actions:
//   searches (what Entries ▾ lists: ONLY the entries this user saved on My
//   Entries; `query` = the entry's name),
//   allSearches (every entry), myEntries (saved ids), listReady, isAdmin,
//   cost { freeLeft, coinsPerSearch },
//   picked ([id] ticked in Entries ▾), activeId (the pick's key),
//   data ({ search, tracks, status } of the ticked entries that are
//   unlocked, together — lib/research/myEntries.js combineEntries),
//   lockedList ([{ entry, coinsPerUnlock, freeLeft }] the ticked ones not
//   unlocked yet), openError (why none could open), loading, busy
//   ('unlock' | null), unlocking (its id),
//   gate (for BillingGateModal), progress / notice (none here — reading
//   happens on the admin's New Search page)
//   + pick(ids) / open(id) / unlock(id).
// Nothing is ticked when the page opens — the user picks in Entries ▾.
const BILLING_ALERTS = ['access_denied', 'activation_required', 'insufficient_coins', 'coins_expired', 'feature_unavailable'];
const keyOf = (ids) => (ids.length ? ids.join(',') : null);

// The ticked entries that are open (`opened` = id → its data), in pick
// order, as one view.
const combineOpened = (opened, ids) => combineEntries(
  ids.filter((id) => opened.has(id)).map((id) => {
    const d = opened.get(id);
    return { entry: { id, name: d.search?.name || d.search?.query || id }, data: d };
  }),
  keyOf(ids),
);

export function useResearch({ signedIn, addToast }) {
  const [allSearches, setAllSearches] = useState([]);
  const [myEntries, setMyEntries] = useState([]);
  const [listReady, setListReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cost, setCost] = useState(null);
  const [picked, setPicked] = useState([]);
  const [data, setData] = useState(null);
  const [lockedList, setLockedList] = useState([]);
  const [openError, setOpenError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [unlocking, setUnlocking] = useState(null);
  const [gate, setGate] = useState(null);
  const openSeq = useRef(0);
  const opened = useRef(new Map()); // id → its data, for the entries now ticked

  const searches = useMemo(() => listedEntries(allSearches, myEntries), [allSearches, myEntries]);

  // → { list (every entry), mine (saved ids) }
  const loadList = useCallback(async () => {
    const res = await listEntries();
    setListReady(true);
    if (!res.ok) return { list: [], mine: [] };
    const list = (res.data.entries || []).map((e) => ({ ...e, query: e.name }));
    const mine = Array.isArray(res.data.myEntries) ? res.data.myEntries : [];
    setAllSearches(list);
    setMyEntries(mine);
    setIsAdmin(!!res.data.isAdmin);
    setCost({ freeLeft: res.data.freeLeft ?? 0, coinsPerSearch: res.data.coinsPerUnlock ?? 0 });
    return { list, mine };
  }, []);

  // Tick these entries: each is opened (in parallel); the unlocked ones show
  // together, the locked ones get Unlock cards.
  const pick = useCallback(async (ids) => {
    const next = [...new Set(ids)].slice(0, MAX_PICK);
    const seq = ++openSeq.current;
    setPicked(next);
    setLockedList([]);
    setOpenError(null);
    opened.current = new Map();
    if (!next.length) { setData(null); setLoading(false); return; }
    setLoading(true);
    const answers = await Promise.all(next.map((id) => getEntry(id)));
    if (seq !== openSeq.current) return;
    setLoading(false);
    const locked = [];
    const failed = [];
    answers.forEach((res, i) => {
      if (res.status === 402 && res.data?.locked) locked.push(res.data);
      else if (res.ok) opened.current.set(next[i], res.data);
      else if (res.status !== 401) failed.push(res.data?.error || 'Could not open this entry');
    });
    setLockedList(locked);
    setData(combineOpened(opened.current, next));
    if (failed.length) {
      setOpenError(failed[0]);
      addToast(failed.length === 1 ? failed[0] : `${failed.length} entries couldn’t open — ${failed[0]}`, 'error');
    }
  }, [addToast]);

  const open = useCallback((id) => pick(id ? [id] : []), [pick]);

  // First load: just the list — nothing is ticked until the user picks.
  // Deferred a tick so a StrictMode double-mount fires it once.
  useEffect(() => {
    if (!signedIn) return undefined;
    const t = setTimeout(loadList, 0);
    return () => clearTimeout(t);
  }, [signedIn, loadList]);

  const unlock = useCallback(async (id) => {
    setBusy('unlock');
    setUnlocking(id);
    const res = await unlockEntry(id);
    setBusy(null);
    setUnlocking(null);
    if (!res.ok) {
      if (res.status === 401) return;
      if (res.status === 402 && BILLING_ALERTS.includes(res.data?.reason)) {
        setGate({ reason: res.data.reason, data: res.data.data });
        track('tool_limit_reached', { feature: 'unlock', reason: res.data.reason });
        return;
      }
      addToast(res.data?.error || 'Could not unlock — try again.', 'error');
      return;
    }
    track('tool_used', { feature: 'unlock', coins: res.data.charged?.coins ?? 0 });
    const c = res.data.charged || {};
    addToast(c.already ? 'Opened' : c.free ? 'Unlocked — your free one' : `Unlocked — ${c.coins} coin${c.coins === 1 ? '' : 's'} used`);
    // It joins the ticked entries already shown (nothing else is read again).
    if (picked.includes(id)) {
      opened.current.set(id, res.data);
      setLockedList((list) => list.filter((l) => l.entry?.id !== id));
      setData(combineOpened(opened.current, picked));
    }
    loadList();
  }, [addToast, loadList, picked]);

  return {
    searches, allSearches, myEntries, listReady, isAdmin, cost,
    picked, activeId: keyOf(picked), data, lockedList, openError, loading, busy, unlocking, gate,
    closeGate: () => setGate(null), progress: null, notice: [], pick, open, unlock,
  };
}
