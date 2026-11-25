// Display text for Product Research cells and cards. Pure.
import { fmtAnyDate } from '@/lib/table/dates';

export const NO_DATA = '-';

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const fmtMoney = (v) => (v == null ? NO_DATA : `₹${(Math.abs(v) < 100 ? inr2 : inr).format(v)}`);
export const fmtInt = (v) => (v == null ? NO_DATA : inr.format(Math.round(v)));
export const fmtRating = (v) => (v == null ? NO_DATA : Number(v).toFixed(1));
export const fmtPct = (v) => (v == null ? NO_DATA : `${v}%`);
export const fmtDay = (iso) => (iso ? fmtAnyDate(iso) : NO_DATA);
export const fmtRank = (v) => (v == null ? NO_DATA : `#${v}`);

// Bought in past month, Amazon's way: 50+, 800+, 1K+, 10K+ (a lower bound).
export function fmtBought(v) {
  if (v == null) return NO_DATA;
  if (v >= 1000) return `${Math.round((v / 1000) * 10) / 10}K+`;
  return `${Math.round(v)}+`;
}

// A rank move: +3 = climbed three places (▲), -2 = fell two (▼), 0 = held.
export function fmtMove(v) {
  if (v == null) return NO_DATA;
  if (v === 0) return '0';
  return `${v > 0 ? '▲' : '▼'} ${Math.abs(v)}`;
}

// A growth number (reviews gained, price change): +12 / -5.
export function fmtSigned(v, money = false) {
  if (v == null) return NO_DATA;
  if (v === 0) return '0';
  const body = money ? fmtMoney(Math.abs(v)) : fmtInt(Math.abs(v));
  return `${v > 0 ? '+' : '−'}${body}`;
}

// Compact axis numbers: 1.2k, 3.4L.
export function compact(n) {
  const a = Math.abs(n);
  if (a >= 100000) return `${Math.round(n / 10000) / 10}L`;
  if (a >= 1000) return `${Math.round(n / 100) / 10}k`;
  return `${Math.round(n * 10) / 10}`;
}
