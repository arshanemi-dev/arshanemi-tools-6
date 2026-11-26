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

// A route that answers with a live stream (lib/research/stream.js): every
// 'plan' / 'progress' event goes to `onEvent` as it arrives; resolves with
// the same { ok, status, data } as request() once the 'result' (ok) or
// 'error' event comes. A plain JSON answer (bad input, 401, 429) is read as
// request() would.
async function streamRequest(path, body, onEvent) {
  let res;
  try {
    res = await authFetch(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
  } catch (err) {
    return { ok: false, status: 0, data: { error: `No response from the server (${err?.message || 'network error'}) — try again in a moment` } };
  }
  if (!(res.headers.get('content-type') || '').includes('ndjson') || !res.body) {
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = null;
  const take = (line) => {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (event.type === 'result') answer = { ok: true, status: 200, data: event.data };
    else if (event.type === 'error') answer = { ok: false, status: event.status || 500, data: event };
    else onEvent?.(event);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        take(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    take(buffer);
  } catch (err) {
    if (!answer) return { ok: false, status: 0, data: { error: `The connection dropped while reading (${err?.message || 'network error'}) — try again in a moment` } };
  }
  return answer || { ok: false, status: 0, data: { error: 'The server stopped before the search finished — try again in a moment' } };
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
// { platform, category, url, fromPage, toPage, autoDaily }
export const createEntry = (body) => request('/api/research/entries', json(body));
export const setAutoDaily = (id, autoDaily) => request(`/api/research/entries/${enc(id)}`, { method: 'PATCH', body: JSON.stringify({ autoDaily }) });
// An edited row: any of { platform, category, url, autoDaily }.
export const updateEntry = (id, changes) => request(`/api/research/entries/${enc(id)}`, { method: 'PATCH', body: JSON.stringify(changes) });
// The one page range every entry is read with.
export const saveRange = (range) => request('/api/research/config', { method: 'PUT', body: JSON.stringify(range) });
// A new category typed into the Category dropdown.
export const addCategory = (name) => request('/api/research/categories', json({ name }));
// { ids: [...] } or { all: true }
export const deleteEntries = (body) => request('/api/research/entries/delete', json(body));
// "Search now" — a live stream of progress per entry.
export const runEntries = (ids, onEvent) => streamRequest('/api/research/entries/run', { ids }, onEvent);
export const importEntry = ({ name, rows }) => request('/api/research/entries/import', json({ name, rows }));
// { action: 'clean-unused' } · { action: 'trim', days } · { action: 'wipe', confirm: 'DELETE' }
export const adminAction = (body) => request('/api/research/admin', json(body));
