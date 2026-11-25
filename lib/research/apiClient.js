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
    if (!answer) return { ok: false, status: 0, data: { error: `The connection dropped while reading (${err?.message || 'network error'}) — open the search again from My Searches in a moment` } };
  }
  return answer || { ok: false, status: 0, data: { error: 'The server stopped before the search finished — open it again from My Searches in a moment' } };
}

const json = (body) => ({ method: 'POST', body: JSON.stringify(body) });

export const listSearches = () => request('/api/research/searches');
export const getSearch = (id) => request(`/api/research/searches/${encodeURIComponent(id)}`);
export const deleteSearch = (id) => request(`/api/research/searches/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const refreshSearch = (id, onEvent) => streamRequest(`/api/research/searches/${encodeURIComponent(id)}/refresh`, {}, onEvent);
// { mode: 'category', query, platforms, fromPage, toPage } or { mode: 'url', urls, fromPage, toPage }
export const runSearch = (args, onEvent) => streamRequest('/api/research/search', args, onEvent);
export const importRows = ({ name, rows }) => request('/api/research/import', json({ name, rows }));
