'use client';

import { useCallback, useEffect, useState } from 'react';
import { addCategory as addCategoryApi, createEntry, deleteEntries, getRun, importEntry, listEntries, startRun, updateEntry } from './apiClient';
import { readResearchSheet } from './importSheet';

// The master admin's New Search page. → state + actions:
//   access: 'checking' | 'denied' | 'ready' | 'error' — the page draws
//   nothing of its own until the server has said this is the master admin;
//   entries (each with products, days, lastRead, lastError, lastRun),
//   storage, categories, progress (an import's — LoadingPanel's shape),
//   busy + reload / add / update / run / setSetting / remove / importFile /
//   newCategory.
// Search runs in the BACKGROUND on the server (lib/research/backgroundRun.js):
//   run(ids)     starts it → the run (or null); its window opens
//   runDoc       the run as last heard (state 'running' | 'done' | 'stopped')
//   running      it's still going — asked again every POLL_MS
//   runOpen / setRunOpen   its window (closing it doesn't stop anything)
//   runFinished  goes up by one when a run ends (the page reloads its data)
// A run still going when the page opens is picked up again.

const POLL_MS = 3000;

// A finished run in one line — for the toast.
function runSummary(run) {
  if (run.state === 'stopped') return { text: run.error || 'The Search stopped before finishing.', tone: 'error' };
  const results = run.results || [];
  const failed = results.filter((x) => !x.products);
  const products = results.reduce((n, x) => n + (x.products || 0), 0);
  return failed.length
    ? { text: `${results.length - failed.length} of ${results.length} read · ${failed.map((x) => `${x.name}: ${x.error || 'no products'}`).join(' · ')}`, tone: 'error' }
    : { text: `${results.length} ${results.length === 1 ? 'entry' : 'entries'} read · ${products} products`, tone: 'success' };
}

export function useAdminEntries({ signedIn, addToast }) {
  const [access, setAccess] = useState('checking');
  const [entries, setEntries] = useState([]);
  const [storage, setStorage] = useState(null);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(null); // 'save' | 'run' | 'delete' | 'import'
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(() => new Set()); // entry ids whose Products to Read / Read every is saving
  const [runDoc, setRunDoc] = useState(null);
  const [runOpen, setRunOpen] = useState(false);
  const [runFinished, setRunFinished] = useState(0);
  const running = runDoc?.state === 'running';

  const reload = useCallback(async () => {
    const res = await listEntries();
    if (res.status === 401) { setAccess('denied'); return; }
    if (!res.ok) { setAccess((a) => (a === 'ready' ? a : 'error')); return; }
    if (!res.data.isAdmin) { setAccess('denied'); return; }
    setEntries(res.data.entries || []);
    setStorage(res.data.storage || null);
    setCategories(res.data.categories || []);
    setAccess('ready');
  }, []);

  useEffect(() => {
    if (!signedIn) { const t = setTimeout(() => setAccess('denied'), 0); return () => clearTimeout(t); }
    const t = setTimeout(reload, 0);
    return () => clearTimeout(t);
  }, [signedIn, reload]);

  // Search: start reading these entries in the background → the run, or
  // null (why not is shown). Its window opens; one already going is shown.
  const run = useCallback(async (ids) => {
    setBusy('run');
    const res = await startRun(ids);
    setBusy(null);
    if (res.status === 409 && res.data?.run) {
      addToast(res.data.error, 'error');
      setRunDoc(res.data.run);
      setRunOpen(true);
      return null;
    }
    if (!res.ok) { if (res.status !== 401) addToast(res.data?.error || 'Could not start the Search — try again.', 'error'); return null; }
    setRunDoc(res.data.run);
    setRunOpen(true);
    return res.data.run;
  }, [addToast]);

  // A run that ended: say how it went, show the fresh data.
  const finish = useCallback(async (done) => {
    const { text, tone } = runSummary(done);
    addToast(text, tone);
    await reload();
    setRunFinished((n) => n + 1);
  }, [addToast, reload]);

  // When the page opens: a Search still running is picked up again.
  useEffect(() => {
    if (access !== 'ready') return undefined;
    let alive = true;
    getRun().then((res) => { if (alive && res.ok && res.data.run?.state === 'running') setRunDoc(res.data.run); });
    return () => { alive = false; };
  }, [access]);

  // While it runs: ask again every POLL_MS (a failed ask just asks again).
  useEffect(() => {
    if (!running) return undefined;
    const id = runDoc.id;
    const t = setTimeout(async () => {
      const res = await getRun();
      const next = res.ok ? res.data.run : null;
      if (!res.ok || !next) { setRunDoc((cur) => (cur ? { ...cur } : cur)); return; }
      setRunDoc(next);
      if (next.id === id && next.state !== 'running') finish(next);
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [running, runDoc, finish]);

  // A new row saved → the entry (not read yet — Search reads it), or null
  // when refused (the reason is shown).
  const add = useCallback(async (row) => {
    setBusy('save');
    const res = await createEntry(row);
    setBusy(null);
    if (!res.ok) { if (res.status !== 401) addToast(res.data?.error || 'Could not save it', 'error'); return null; }
    addToast(`Saved ${res.data.entry.name} — it’s ticked: press Search to read it`);
    await reload();
    return res.data.entry;
  }, [addToast, reload]);

  // An edited row saved → the entry, or null when refused.
  const update = useCallback(async (id, changes) => {
    setBusy('save');
    const res = await updateEntry(id, changes);
    setBusy(null);
    if (!res.ok) { if (res.status !== 401) addToast(res.data?.error || 'Could not save it', 'error'); return null; }
    addToast(res.data.newHistory ? `Saved ${res.data.entry.name} — it reads something new now, so its history starts again on the next Search` : `Saved ${res.data.entry.name}`);
    await reload();
    return res.data.entry;
  }, [addToast, reload]);

  // A category typed into the dropdown + Enter → its name, or null.
  const newCategory = useCallback(async (name) => {
    const res = await addCategoryApi(name);
    if (!res.ok) { addToast(res.data?.error || 'Could not add that category', 'error'); return null; }
    setCategories(res.data.categories);
    return res.data.category;
  }, [addToast]);

  // A number typed into a row (Products to Read / Read every N days) —
  // `patch` = { targetProducts } or { everyDays }, already checked: shown at
  // once, saved; back to before if refused. → true when saved.
  const setSetting = useCallback(async (entry, patch) => {
    const local = 'everyDays' in patch ? { ...patch, autoDaily: patch.everyDays > 0 } : patch;
    const before = Object.fromEntries(Object.keys(local).map((k) => [k, entry[k]]));
    const apply = (p) => setEntries((list) => list.map((e) => (e.id === entry.id ? { ...e, ...p } : e)));
    apply(local);
    setSaving((s) => new Set(s).add(entry.id));
    const res = await updateEntry(entry.id, patch);
    setSaving((s) => { const n = new Set(s); n.delete(entry.id); return n; });
    if (!res.ok) {
      apply(before);
      if (res.status !== 401) addToast(res.data?.error || 'Could not save it', 'error');
      return false;
    }
    return true;
  }, [addToast]);

  const remove = useCallback(async (ids) => {
    setBusy('delete');
    const res = await deleteEntries(ids === 'all' ? { all: true } : { ids });
    setBusy(null);
    if (!res.ok) { addToast(res.data?.error || 'Could not delete — try again.', 'error'); return false; }
    const r = res.data;
    addToast(`${r.entries} ${r.entries === 1 ? 'entry' : 'entries'} deleted${r.deletedData ? ` · saved data removed for ${r.deletedData}` : ''}${r.keptShared ? ` · ${r.keptShared} kept (another entry reads the same page)` : ''}`);
    await reload();
    return true;
  }, [addToast, reload]);

  const importFile = useCallback(async (file) => {
    if (!file) return null;
    setBusy('import');
    setProgress({ kind: 'import', label: file.name, startedAt: Date.now(), jobs: [] });
    const sheet = await readResearchSheet(file).catch((err) => ({ rows: [], error: `Could not read the file (${err?.message || 'unknown error'})` }));
    let res = null;
    if (!sheet.error) res = await importEntry({ name: file.name.replace(/\.[^.]+$/, ''), rows: sheet.rows });
    setBusy(null);
    setProgress(null);
    if (sheet.error) { addToast(sheet.error, 'error'); return null; }
    if (!res.ok) { if (res.status !== 401) addToast(res.data?.error || 'Import failed', 'error'); return null; }
    addToast(`Imported ${res.data.imported} rows as ${res.data.entry.name}${res.data.skipped ? ` · ${res.data.skipped} skipped (no Link or Date)` : ''}`);
    await reload();
    return res.data.entry;
  }, [addToast, reload]);

  return {
    access, entries, storage, categories, progress, busy, saving,
    runDoc, running, runOpen, setRunOpen, runFinished,
    reload, add, update, run, setSetting, remove, importFile, newCategory,
  };
}
