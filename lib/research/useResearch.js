'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteSearch, getSearch, importRows, listSearches, refreshSearch, runSearch } from './apiClient';
import { readResearchSheet } from './importSheet';
import { todayIST } from './time';
import { marketplaceName } from '@/data/marketplaces';
import { track } from '@/lib/embedBridge';

// Product Research's data layer for the page. → state + actions:
//   searches, listReady (the list has loaded — until then nothing says "no
//   searches yet"), cost { freeLeft, coinsPerSearch }, activeId, data ({
//   search, tracks, status } of the open one), loading, busy ('search' |
//   'import' | 'refresh' | null), progress (live, while a search or refresh
//   runs — see below), gate (for BillingGateModal), notice (the last run's
//   per-marketplace problems) + open / search / importFile / refresh / remove.
//
// progress = { kind: 'search' | 'refresh' | 'import', label, startedAt,
//   jobs: [{ id, platform, label, state: 'waiting' | 'reading' | 'cached' |
//   'done' | 'failed', page, pages, products, error }] } — filled from the
//   route's live stream, one job per marketplace (or pasted link).
//
// Opening a search whose tracks haven't been read today refreshes it in the
// background (free) — so the daily history fills in even between cron runs.
const BILLING_ALERTS = ['access_denied', 'activation_required', 'insufficient_coins', 'coins_expired', 'feature_unavailable'];

function problemsOf(list) {
  return (list || []).filter((s) => s.error).map((s) => `${s.label || marketplaceName(s.platform)}: ${s.blocked ? 'blocked the request (robot check) — ' : ''}${s.error}`);
}

// One stream event → the next progress state.
function applyEvent(cur, ev) {
  if (!cur) return cur;
  if (ev.type === 'plan') {
    return { ...cur, label: ev.label || cur.label, jobs: ev.jobs.map((j) => ({ ...j, state: 'waiting', page: 0, pages: 0, products: 0, error: null })) };
  }
  if (ev.type === 'progress') {
    return { ...cur, jobs: cur.jobs.map((j) => (j.id === ev.id ? { ...j, ...ev, type: undefined } : j)) };
  }
  return cur;
}

export function useResearch({ signedIn, addToast }) {
  const [searches, setSearches] = useState([]);
  const [listReady, setListReady] = useState(false);
  const [cost, setCost] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState(null);
  const [gate, setGate] = useState(null);
  const [notice, setNotice] = useState([]);
  const openSeq = useRef(0);

  const loadList = useCallback(async () => {
    const res = await listSearches();
    setListReady(true);
    if (!res.ok) return [];
    setSearches(res.data.searches || []);
    setCost({ freeLeft: res.data.freeLeft ?? 0, coinsPerSearch: res.data.coinsPerSearch ?? 0 });
    return res.data.searches || [];
  }, []);

  const startProgress = (kind, label) => setProgress({ kind, label, startedAt: Date.now(), jobs: [] });
  const onEvent = (ev) => setProgress((cur) => applyEvent(cur, ev));

  const refresh = useCallback(async (id, { quiet = false } = {}) => {
    setBusy('refresh');
    startProgress('refresh', '');
    const res = await refreshSearch(id, onEvent);
    setBusy(null);
    setProgress(null);
    if (!res.ok) {
      if (!quiet) addToast(res.data?.error || 'Could not refresh — try again.', 'error');
      return;
    }
    setData((cur) => (cur?.search?.id === id ? res.data : cur));
    const problems = problemsOf(res.data.refreshed);
    setNotice(problems);
    if (!quiet) addToast(problems.length ? 'Refreshed — some market places could not be read today' : 'Today’s snapshot is in', problems.length ? 'error' : 'success');
  }, [addToast]);

  const open = useCallback(async (id) => {
    const seq = ++openSeq.current;
    setActiveId(id);
    setNotice([]);
    if (!id) { setData(null); return; }
    setLoading(true);
    const res = await getSearch(id);
    if (seq !== openSeq.current) return;
    setLoading(false);
    if (!res.ok) { addToast(res.data?.error || 'Could not open this search', 'error'); return; }
    setData(res.data);
    const s = res.data.search;
    const expected = s.kind === 'url' ? (s.urls || []).length : (s.platforms || []).length;
    const stale = s.kind !== 'import' && res.data.status.some((st) => st.lastRunDate !== todayIST());
    if (s.kind !== 'import' && (stale || res.data.status.length < expected)) refresh(id, { quiet: true });
  }, [addToast, refresh]);

  // First load: the list, then the newest search opened. Deferred a tick so
  // a StrictMode double-mount fires it once (the first timer is cleared).
  useEffect(() => {
    if (!signedIn) return undefined;
    const t = setTimeout(() => {
      loadList().then((list) => { if (list[0]) open(list[0].id); });
    }, 0);
    return () => clearTimeout(t);
  }, [signedIn, loadList, open]);

  const blocked = (res) => {
    if (res.status === 402 && BILLING_ALERTS.includes(res.data?.reason)) {
      setGate({ reason: res.data.reason, data: res.data.data });
      return true;
    }
    if (res.status === 403 || res.data?.reason === 'access_denied') {
      setGate({ reason: 'access_denied', data: res.data?.data });
      return true;
    }
    return false;
  };

  // args = { mode: 'category', query, platforms, fromPage, toPage }
  //     or { mode: 'url', urls, fromPage, toPage }
  const search = useCallback(async (args) => {
    setBusy('search');
    setNotice([]);
    startProgress('search', args.mode === 'url' ? `${args.urls.length} link${args.urls.length === 1 ? '' : 's'}` : args.query);
    const res = await runSearch(args, onEvent);
    setBusy(null);
    setProgress(null);
    if (!res.ok) {
      if (res.status === 401) return; // the login modal is already open
      if (blocked(res)) { track('tool_limit_reached', { feature: 'search', reason: res.data?.reason }); return; }
      setNotice(problemsOf(res.data?.results));
      addToast(res.data?.error || 'Search failed — try again.', 'error');
      return;
    }
    track('tool_used', { feature: 'search', mode: args.mode, targets: args.mode === 'url' ? args.urls.length : args.platforms.length, from_page: args.fromPage, to_page: args.toPage, coins: res.data.charged?.coins ?? 0 });
    setData(res.data);
    setActiveId(res.data.search.id);
    setNotice(problemsOf(res.data.results));
    const c = res.data.charged || {};
    addToast(c.reopened ? 'You already track this — opened it (no coins used)' : c.free ? 'Search added — your free search' : `Search added — ${c.coins} coin${c.coins === 1 ? '' : 's'} used`);
    loadList();
  }, [addToast, loadList]);

  const importFile = useCallback(async (file) => {
    if (!file) return;
    setBusy('import');
    setProgress({ kind: 'import', label: file.name, startedAt: Date.now(), jobs: [] });
    const sheet = await readResearchSheet(file).catch((err) => ({ rows: [], error: `Could not read the file (${err?.message || 'unknown error'})` }));
    if (sheet.error) { setBusy(null); setProgress(null); addToast(sheet.error, 'error'); return; }
    const res = await importRows({ name: file.name.replace(/\.[^.]+$/, ''), rows: sheet.rows });
    setBusy(null);
    setProgress(null);
    if (!res.ok) { if (res.status !== 401) addToast(res.data?.error || 'Import failed', 'error'); return; }
    track('tool_used', { feature: 'import', rows: res.data.imported });
    setData(res.data);
    setActiveId(res.data.search.id);
    addToast(`Imported ${res.data.imported} row${res.data.imported === 1 ? '' : 's'}${res.data.skipped ? ` · ${res.data.skipped} skipped (no Link or Date)` : ''}`);
    loadList();
  }, [addToast, loadList]);

  const remove = useCallback(async (s) => {
    const res = await deleteSearch(s.id);
    if (!res.ok) { addToast(res.data?.error || 'Could not remove it', 'error'); return false; }
    const list = await loadList();
    if (activeId === s.id) open(list[0]?.id || null);
    addToast(`Stopped tracking “${s.query}”`);
    return true;
  }, [activeId, addToast, loadList, open]);

  return { searches, listReady, cost, activeId, data, loading, busy, progress, gate, closeGate: () => setGate(null), notice, open, search, importFile, refresh, remove };
}
