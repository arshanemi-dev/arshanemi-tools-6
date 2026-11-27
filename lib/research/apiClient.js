'use client';

import { authFetch } from '@/lib/tokenStore';

// Thin wrappers over /api/research/*. Each returns { ok, status, data } and
// never throws — a request that got no answer at all comes back as status 0.
// authFetch attaches the Bearer token, refreshes it, and opens the shared
// login modal on a final 401.
async function request(path, options) {
  try {
    const res = await authFetch(path, options);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: `No response from the server (${err?.message || 'network error'}) — try again in a moment` } };
  }
}

const json = (body) => ({ method: 'POST', body: JSON.stringify(body) });

const enc = encodeURIComponent;

// Everyone
export const listEntries = () => request('/api/research/entries');
export const getEntry = (id) => request(`/api/research/entries/${enc(id)}`); // 402 { locked } until unlocked
// My Entries — this user's own list, a month paid per entry (data/billing.js).
// The list comes with listEntries() (`myEntries`, each entry's `status`, `due`).
// Add: charges the entries not paid right now — 402 { status: 'blocked',
// reason, data } when the wallet refuses. `requestId` = one per click.
export const addMyEntries = (ids, requestId) => request('/api/research/my-entries', json({ add: ids, requestId }));
export const removeMyEntries = (ids) => request('/api/research/my-entries', json({ remove: ids }));
// Renew: no ids = the monthly renewal of the saved ones that ran out; ids =
// these Expired ones, by hand.
export const renewMyEntries = (ids = null) => request('/api/research/my-entries/renew', json(ids ? { ids } : {}));

// Master admin
// { platform, category, url, targetProducts, everyDays }
export const createEntry = (body) => request('/api/research/entries', json(body));
// An edited row: any of { platform, category, url, targetProducts, everyDays }.
export const updateEntry = (id, changes) => request(`/api/research/entries/${enc(id)}`, { method: 'PATCH', body: JSON.stringify(changes) });
// A new category typed into the Category dropdown.
export const addCategory = (name) => request('/api/research/categories', json({ name }));
// { ids: [...] } or { all: true }
export const deleteEntries = (body) => request('/api/research/entries/delete', json(body));
// Search — runs in the background (lib/research/backgroundRun.js):
// startRun → 202 { run } at once (409 { error, run } while one runs);
// getRun → { run } — the latest run, asked again while it runs.
export const startRun = (ids) => request('/api/research/entries/run', json({ ids }));
export const getRun = () => request('/api/research/entries/run');
export const importEntry = ({ name, rows }) => request('/api/research/entries/import', json({ name, rows }));
// { action: 'clean-unused' } · { action: 'trim', days } · { action: 'wipe', confirm: 'DELETE' }
export const adminAction = (body) => request('/api/research/admin', json(body));
