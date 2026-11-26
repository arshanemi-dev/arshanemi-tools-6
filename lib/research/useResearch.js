'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getEntry, listEntries, unlockEntry } from './apiClient';
import { track } from '@/lib/embedBridge';

// The home page's data layer: every entry the master admin added, the open
// one's data, and unlocking. → state + actions:
//   searches (the entries, `query` = the entry's name — what the shared
//   components show), listReady, isAdmin, cost { freeLeft, coinsPerSearch },
//   activeId, data ({ search, tracks, status } of the open entry), locked
//   (the open entry's lock info when it isn't unlocked yet), loading, busy
//   ('unlock' | null), gate (for BillingGateModal), progress / notice (none
//   here — reading happens on the admin's New Search page) + open / unlock.
// The open entry is remembered across visits (localStorage).
const BILLING_ALERTS = ['access_denied', 'activation_required', 'insufficient_coins', 'coins_expired', 'feature_unavailable'];
const ACTIVE_KEY = 'pr-active-entry';
const saveActive = (id) => { try { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); } catch { /* private mode */ } };
const readActive = () => { try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; } };

export function useResearch({ signedIn, addToast }) {
  const [searches, setSearches] = useState([]);
  const [listReady, setListReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cost, setCost] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [data, setData] = useState(null);
  const [locked, setLocked] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [gate, setGate] = useState(null);
  const openSeq = useRef(0);

  const loadList = useCallback(async () => {
    const res = await listEntries();
    setListReady(true);
    if (!res.ok) return [];
    const list = (res.data.entries || []).map((e) => ({ ...e, query: e.name }));
    setSearches(list);
    setIsAdmin(!!res.data.isAdmin);
    setCost({ freeLeft: res.data.freeLeft ?? 0, coinsPerSearch: res.data.coinsPerUnlock ?? 0 });
    return list;
  }, []);

  const open = useCallback(async (id) => {
    const seq = ++openSeq.current;
    setActiveId(id);
    saveActive(id);
    setLocked(null);
    if (!id) { setData(null); return; }
    setLoading(true);
    const res = await getEntry(id);
    if (seq !== openSeq.current) return;
    setLoading(false);
    if (res.status === 402 && res.data?.locked) { setData(null); setLocked(res.data); return; }
    if (!res.ok) { addToast(res.data?.error || 'Could not open this entry', 'error'); return; }
    setData(res.data);
  }, [addToast]);

  // First load: the list, then the last open entry (else the first unlocked
  // one, else the first). Deferred a tick so a StrictMode double-mount fires it once.
  useEffect(() => {
    if (!signedIn) return undefined;
    const t = setTimeout(() => {
      loadList().then((list) => {
        if (!list.length) return;
        const saved = readActive();
        const pick = list.find((s) => s.id === saved) || list.find((s) => !s.locked) || list[0];
        open(pick.id);
      });
    }, 0);
    return () => clearTimeout(t);
  }, [signedIn, loadList, open]);

  const unlock = useCallback(async (id) => {
    setBusy('unlock');
    const res = await unlockEntry(id);
    setBusy(null);
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
    setLocked(null);
    setData(res.data);
    setActiveId(id);
    saveActive(id);
    loadList();
  }, [addToast, loadList]);

  return {
    searches, listReady, isAdmin, cost, activeId, data, locked, loading, busy, gate,
    closeGate: () => setGate(null), progress: null, notice: [], open, unlock,
  };
}
