// Two numbers the master admin types per entry on New Search. Shared by the
// server (the real check — lib/research/entries.js, the cron) and the page
// (the input boxes), so both always agree. Pure.
//
//   everyDays   read again by itself every N days: 0 = never by itself (only
//               when Search is pressed), 1 = every day, 2 = every 2 days, …
//   maxPerPage  keep only the first N products of every page read (ads don't
//               count toward N); null = every product on the page.
//
// Entries saved before these existed have only `autoDaily` (true / false):
// everyDaysOf reads that as 1 / 0.

export const MAX_EVERY_DAYS = 365;
export const MAX_PER_PAGE = 500;

export function everyDaysOf(entry) {
  if (Number.isInteger(entry?.everyDays)) return entry.everyDays;
  return entry?.autoDaily === false ? 0 : 1;
}

const whole = (v) => (typeof v === 'number' ? v : Number(String(v).trim()));

// What was typed → { value } or { error } in plain words.
export function readEveryDays(v) {
  if (v === '' || v == null) return { value: 0 };
  const n = whole(v);
  if (!Number.isInteger(n) || n < 0 || n > MAX_EVERY_DAYS) return { error: `Read every: type a whole number of days from 0 to ${MAX_EVERY_DAYS} (0 = only when you press Search)` };
  return { value: n };
}

export function readMaxPerPage(v) {
  if (v === '' || v == null || v === 0 || v === '0') return { value: null };
  const n = whole(v);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PER_PAGE) return { error: `Products / Page: type a whole number from 1 to ${MAX_PER_PAGE}, or leave it empty for all` };
  return { value: n };
}

// Is the entry due for its automatic read today? `lastRunDate` = the day it
// was last read ("YYYY-MM-DD", or null), `daysSince(a, b)` = a − b in days.
export function isDue(entry, lastRunDate, today, daysSince) {
  const every = everyDaysOf(entry);
  if (!every || entry?.kind === 'import') return false;
  if (!lastRunDate) return true;
  return daysSince(today, lastRunDate) >= every;
}

export const everyDaysText = (n) => (!n ? 'Off' : n === 1 ? 'Every day' : `Every ${n} days`);
