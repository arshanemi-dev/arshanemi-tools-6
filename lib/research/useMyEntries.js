'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { listEntries } from './apiClient';
import { useEntryBilling } from './useEntryBilling';

// The My Entries page (/product-research/my-entries). → state + actions:
//   state    'loading' | 'ready' | 'error'
//   entries  every entry ({ id, name, platform, category, kind, fromPage,
//            toPage, saved, status ('active' | 'expired' | 'none'),
//            paidUntil, autoRenew })
//   mine     the ids on this user's list (the server's answer — the truth)
//   price    coins for one entry for one month (0 = free: the master admin,
//            or billing off)
//   isAdmin, billing (useEntryBilling — Add / Remove / Renew + windows),
//   reload
// On the first load, saved entries whose month ran out are renewed (the
// monthly charge), once.
export function useMyEntries({ signedIn, addToast }) {
  const [state, setState] = useState('loading');
  const [entries, setEntries] = useState([]);
  const [mine, setMine] = useState([]);
  const [price, setPrice] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const renewedOnce = useRef(false);

  // → { list, due } (due = saved ids whose month ran out)
  const reload = useCallback(async () => {
    const res = await listEntries();
    if (!res.ok) { setState((s) => (s === 'ready' ? s : 'error')); return { list: [], due: [] }; }
    const list = res.data.entries || [];
    setEntries(list);
    setMine(res.data.myEntries || []);
    setPrice(res.data.coinsPerMonth ?? 0);
    setIsAdmin(!!res.data.isAdmin);
    setState('ready');
    return { list, due: res.data.due || [] };
  }, []);

  const billing = useEntryBilling({ addToast, price, onChanged: reload });
  const { autoRenew } = billing;

  useEffect(() => {
    if (!signedIn) return undefined;
    // a tick later, so a StrictMode double-mount loads once
    const t = setTimeout(async () => {
      const { list, due } = await reload();
      if (due.length && !renewedOnce.current) {
        renewedOnce.current = true;
        autoRenew(Object.fromEntries(list.map((e) => [e.id, e.name])));
      }
    }, 0);
    return () => clearTimeout(t);
  }, [signedIn, reload, autoRenew]);

  return { state, entries, mine, price, isAdmin, billing, reload };
}
