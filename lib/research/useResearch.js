'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getEntry, listEntries } from './apiClient';
import { combineEntries, listedEntries, MAX_PICK } from './myEntries';
import { useEntryBilling } from './useEntryBilling';

// The home page's data layer: every entry the master admin added, the
// entries ticked in Entries ▾ (several at once), their data together, and
// paying for them (data/billing.js). → state + actions:
//   searches (what Entries ▾ lists: ONLY the entries this user saved on My
//   Entries, each with its plan `status` — 'active' | 'expired';
//   `query` = the entry's name), allSearches (every entry), myEntries
//   (saved ids), listReady, isAdmin, cost { coinsPerMonth },
//   picked ([id] ticked in Entries ▾), activeId (the pick's key),
//   data ({ search, tracks, status } of the ticked entries whose month is
//   paid, together — lib/research/myEntries.js combineEntries),
//   lockedList ([{ entry, planStatus, paidUntil }] the ticked ones not paid
//   now — Expired), openError (why none could open), loading,
//   billing (useEntryBilling — Renew, the windows), progress / notice (none
//   here — reading happens on the admin's New Search page)
//   + pick(ids) / open(id) / refresh().
// Nothing is ticked when the page opens — the user picks in Entries ▾. On
// the first load, saved entries whose month ran out are renewed (the
// monthly charge), once.
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
  const [cost, setCost] = useState({ coinsPerMonth: 0 });
  const [picked, setPicked] = useState([]);
  const [data, setData] = useState(null);
  const [lockedList, setLockedList] = useState([]);
  const [openError, setOpenError] = useState(null);
  const [loading, setLoading] = useState(false);
  const openSeq = useRef(0);
  const opened = useRef(new Map()); // id → its data, for the entries now ticked
  const pickedNow = useRef([]);
  const renewedOnce = useRef(false);

  const searches = useMemo(() => listedEntries(allSearches, myEntries), [allSearches, myEntries]);

  // → { list (every entry), due (saved ids whose month ran out) }
  const loadList = useCallback(async () => {
    const res = await listEntries();
    setListReady(true);
    if (!res.ok) return { list: [], due: [] };
    const list = (res.data.entries || []).map((e) => ({ ...e, query: e.name }));
    setAllSearches(list);
    setMyEntries(Array.isArray(res.data.myEntries) ? res.data.myEntries : []);
    setIsAdmin(!!res.data.isAdmin);
    setCost({ coinsPerMonth: res.data.coinsPerMonth ?? 0 });
    return { list, due: Array.isArray(res.data.due) ? res.data.due : [] };
  }, []);

  // Tick these entries: each is opened (in parallel); the paid ones show
  // together, the Expired ones get Renew cards.
  const pick = useCallback(async (ids) => {
    const next = [...new Set(ids)].slice(0, MAX_PICK);
    const seq = ++openSeq.current;
    pickedNow.current = next;
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

  // After a payment (or a removal): the list again, and the ticked entries
  // again (a renewed one now shows its data).
  const refresh = useCallback(async () => {
    await loadList();
    if (pickedNow.current.length) pick(pickedNow.current);
  }, [loadList, pick]);

  const billing = useEntryBilling({ addToast, price: cost.coinsPerMonth, onChanged: refresh });
  const { autoRenew } = billing;

  // First load: the list — nothing is ticked until the user picks — then
  // the monthly renewal of saved entries whose month ran out (once).
  // Deferred a tick so a StrictMode double-mount fires it once.
  useEffect(() => {
    if (!signedIn) return undefined;
    const t = setTimeout(async () => {
      const { list, due } = await loadList();
      if (due.length && !renewedOnce.current) {
        renewedOnce.current = true;
        autoRenew(Object.fromEntries(list.map((e) => [e.id, e.name])));
      }
    }, 0);
    return () => clearTimeout(t);
  }, [signedIn, loadList, autoRenew]);

  return {
    searches, allSearches, myEntries, listReady, isAdmin, cost,
    picked, activeId: keyOf(picked), data, lockedList, openError, loading, billing,
    progress: null, notice: [], pick, open, refresh,
  };
}
