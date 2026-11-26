'use client';

import { useCallback, useEffect, useState } from 'react';
import { addCategory as addCategoryApi, createEntry, deleteEntries, importEntry, listEntries, runEntries, saveRange as saveRangeApi, updateEntry } from './apiClient';
import { DEFAULT_RANGE } from '@/data/marketplaces';
import { readResearchSheet } from './importSheet';

// The master admin's New Search page. → state + actions:
//   access: 'checking' | 'denied' | 'ready' | 'error' — the page draws
//   nothing of its own until the server has said this is the master admin;
//   entries (each with products, days, lastRead, lastError), storage, range
//   (the ONE page range every entry is read with), categories, progress
//   (live, while entries are read — LoadingPanel's shape), busy + reload /
//   add / update / run / setSetting / remove / importFile / setRange /
//   newCategory.

function applyEvent(cur, ev) {
  if (!cur) return cur;
  if (ev.type === 'plan') return { ...cur, label: ev.label || cur.label, jobs: ev.jobs.map((j) => ({ ...j, state: 'waiting', page: 0, pages: 0, products: 0, error: null })) };
  if (ev.type === 'progress') return { ...cur, jobs: cur.jobs.map((j) => (j.id === ev.id ? { ...j, ...ev, type: undefined } : j)) };
  return cur;
}

export function useAdminEntries({ signedIn, addToast }) {
  const [access, setAccess] = useState('checking');
  const [entries, setEntries] = useState([]);
  const [storage, setStorage] = useState(null);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(null); // 'save' | 'run' | 'delete' | 'import'
  const [range, setRangeState] = useState(DEFAULT_RANGE);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(() => new Set()); // entry ids whose Read every / Products / Page is saving

  const reload = useCallback(async () => {
    const res = await listEntries();
    if (res.status === 401) { setAccess('denied'); return; }
    if (!res.ok) { setAccess((a) => (a === 'ready' ? a : 'error')); return; }
    if (!res.data.isAdmin) { setAccess('denied'); return; }
    setEntries(res.data.entries || []);
    setStorage(res.data.storage || null);
    if (res.data.range) setRangeState(res.data.range);
    setCategories(res.data.categories || []);
    setAccess('ready');
  }, []);

  useEffect(() => {
    if (!signedIn) { const t = setTimeout(() => setAccess('denied'), 0); return () => clearTimeout(t); }
    const t = setTimeout(reload, 0);
    return () => clearTimeout(t);
  }, [signedIn, reload]);

  // Read these entries now (live progress) → the results, or null.
  const run = useCallback(async (ids, label) => {
    setBusy('run');
    setProgress({ kind: 'search', label, startedAt: Date.now(), jobs: [] });
    const res = await runEntries(ids, (ev) => setProgress((cur) => applyEvent(cur, ev)));
    setBusy(null);
    setProgress(null);
    if (!res.ok) { if (res.status !== 401) addToast(res.data?.error || 'The search didn’t finish — try again.', 'error'); return null; }
    const results = res.data.results || [];
    const failed = results.filter((x) => !x.products);
    const products = results.reduce((n, x) => n + (x.products || 0), 0);
    addToast(failed.length
      ? `${results.length - failed.length} of ${results.length} read · ${failed.map((x) => `${x.name}: ${x.error || 'no products'}`).join(' · ')}`
      : `${results.length} ${results.length === 1 ? 'entry' : 'entries'} read · ${products} products`, failed.length ? 'error' : 'success');
    await reload();
    return results;
  }, [addToast, reload]);

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

  // The shared page range: shown at once, saved; back to before if refused.
  const setRange = useCallback(async (next) => {
    const before = range;
    setRangeState(next);
    const res = await saveRangeApi(next);
    if (!res.ok) { setRangeState(before); addToast(res.data?.error || 'Could not save the pages', 'error'); }
  }, [range, addToast]);

  // A category typed into the dropdown + Enter → its name, or null.
  const newCategory = useCallback(async (name) => {
    const res = await addCategoryApi(name);
    if (!res.ok) { addToast(res.data?.error || 'Could not add that category', 'error'); return null; }
    setCategories(res.data.categories);
    return res.data.category;
  }, [addToast]);

  // A number typed into a row (Read every N days / Products per page) —
  // `patch` = { everyDays } or { maxPerPage }, already checked: shown at
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

  return { access, entries, storage, range, categories, progress, busy, saving, reload, add, update, run, setSetting, remove, importFile, setRange, newCategory };
}
