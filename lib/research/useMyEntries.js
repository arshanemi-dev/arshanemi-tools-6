'use client';

import { useCallback, useEffect, useState } from 'react';
import { changeMyEntries, listEntries } from './apiClient';

// The My Entries page (/product-research/my-entries). → state + actions:
//   state    'loading' | 'ready' | 'error'
//   entries  every entry ({ id, name, platform, category, kind, fromPage,
//            toPage, locked })
//   mine     the ids this user saved (the server's answer — the truth)
//   busy     a Set of the ids being saved right now
//   reload, change({ add, remove }) → true when saved
export function useMyEntries({ signedIn, addToast }) {
  const [state, setState] = useState('loading');
  const [entries, setEntries] = useState([]);
  const [mine, setMine] = useState([]);
  const [busy, setBusy] = useState(() => new Set());

  const reload = useCallback(async () => {
    const res = await listEntries();
    if (!res.ok) { setState((s) => (s === 'ready' ? s : 'error')); return; }
    setEntries(res.data.entries || []);
    setMine(res.data.myEntries || []);
    setState('ready');
  }, []);

  useEffect(() => {
    if (!signedIn) return undefined;
    const t = setTimeout(reload, 0); // a tick later, so a StrictMode double-mount loads once
    return () => clearTimeout(t);
  }, [signedIn, reload]);

  const change = useCallback(async ({ add = [], remove = [] }) => {
    const ids = [...add, ...remove];
    if (!ids.length) return false;
    setBusy((b) => new Set([...b, ...ids]));
    const res = await changeMyEntries({ add, remove });
    setBusy((b) => { const n = new Set(b); for (const x of ids) n.delete(x); return n; });
    if (!res.ok) {
      if (res.status !== 401) addToast(res.data?.error || 'Could not save — try again.', 'error');
      return false;
    }
    setMine(res.data.myEntries || []);
    const { added = 0, removed = 0, unknown = [] } = res.data;
    const nameOf = (id) => entries.find((e) => e.id === id)?.name || 'it';
    const parts = [];
    if (added) parts.push(added === 1 && add.length === 1 ? `Added ${nameOf(add[0])}` : `Added ${added} entries`);
    if (removed) parts.push(removed === 1 && remove.length === 1 ? `Removed ${nameOf(remove[0])}` : `Removed ${removed} entries`);
    if (unknown.length) { parts.push(`${unknown.length} no longer exist`); reload(); }
    addToast(parts.length ? parts.join(' · ') : 'Nothing changed', unknown.length && !added && !removed ? 'error' : 'success');
    return true;
  }, [addToast, entries, reload]);

  return { state, entries, mine, busy, reload, change };
}
