// Two numbers the master admin types per entry on New Search. Shared by the
// server (the real check — lib/research/entries.js, the cron) and the page
// (the input boxes), so both always agree. Pure.
//
//   targetProducts  how many products a read collects. A read always starts
//                   at page 1 and goes on to the next page by itself until it
//                   has this many ranked products (ads don't count) — or the
//                   results run out, or MAX_READ_PAGES pages have been read.
//   everyDays       read again by itself every N days: 0 = never by itself
//                   (only when Search is pressed), 1 = every day, 2 = every
//                   2 days, …
//
// Entries saved before these existed: no targetProducts → DEFAULT_TARGET;
// only `autoDaily` (true / false) → everyDays 1 / 0.

export const DEFAULT_TARGET = 100;
export const MAX_TARGET = 1000;
// A safety stop: one read never asks for more pages than this (each page is
// one more paid request to the scraping service).
export const MAX_READ_PAGES = 20;
export const MAX_EVERY_DAYS = 365;

export function targetOf(entry) {
  return Number.isInteger(entry?.targetProducts) && entry.targetProducts > 0 ? entry.targetProducts : DEFAULT_TARGET;
}

export function everyDaysOf(entry) {
  if (Number.isInteger(entry?.everyDays)) return entry.everyDays;
  return entry?.autoDaily === false ? 0 : 1;
}

const whole = (v) => (typeof v === 'number' ? v : Number(String(v).trim()));

// What was typed → { value } or { error } in plain words.
export function readTarget(v) {
  const n = v === '' || v == null ? NaN : whole(v);
  if (!Number.isInteger(n) || n < 1 || n > MAX_TARGET) return { error: `Products to read: type a whole number from 1 to ${MAX_TARGET}` };
  return { value: n };
}

export function readEveryDays(v) {
  if (v === '' || v == null) return { value: 0 };
  const n = whole(v);
  if (!Number.isInteger(n) || n < 0 || n > MAX_EVERY_DAYS) return { error: `Read every: type a whole number of days from 0 to ${MAX_EVERY_DAYS} (0 = only when you press Search)` };
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
