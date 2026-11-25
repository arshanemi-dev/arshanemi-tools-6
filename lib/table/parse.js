// Number / date parsing for table cells and imported sheets (from tools-5's
// data/platforms/canonical.js). Pure.

export function parseNumberish(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (v == null) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/^(rs\.?|inr)\s*/i, '').replace(/[₹$€£,\s]/g, '').replace(/%$/, '').replace(/[−–]/g, '-');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
  const n = Number(s);
  return neg ? -n : n;
}
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const monthOf = (name) => MONTHS[String(name).slice(0, 3).toLowerCase()] || 0;
const fullYear = (y) => (String(y).length <= 2 ? 2000 + Number(y) : Number(y));

// y/m/d → "YYYY-MM-DD", or null when that day doesn't exist (31 Feb, month
// 20) or the year is nonsense (a stray number read as a date).
function ymd(y, m, d) {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!(year >= 1900 && year <= 2200)) return null;
  if (!(month >= 1 && month <= 12) || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Excel serial / "2026-08-20" / "2026/08/20" / "20-08-2026" / "20/08/2026 12:30"
// / "20-08-26" / "20-Aug-2026" / "20 Aug 2026" / "Aug 20, 2026" -> "YYYY-MM-DD" | null.
// The day is read straight off the text — never through a Date in local
// time, which lands a day early in India once it's converted back to UTC.
// Numeric dates are day-first (India); a "month" above 12 with a valid day
// in its place means the text was month-first ("08/20/2026"), so it's swapped.
export function toISODate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 90000) {
    // Excel serial date (days since 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/);
  if (m) return ymd(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/);
  if (m) {
    const year = fullYear(m[3]);
    return Number(m[2]) > 12 && Number(m[1]) <= 12 ? ymd(year, m[1], m[2]) : ymd(year, m[2], m[1]);
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[-/.\s]+([a-z]{3,9})\.?[-/.,\s]+(\d{4}|\d{2})(?!\d)/i);
  if (m && monthOf(m[2])) return ymd(fullYear(m[3]), monthOf(m[2]), m[1]);
  m = s.match(/^([a-z]{3,9})\.?[-/.\s]+(\d{1,2})(?:st|nd|rd|th)?[-/.,\s]+(\d{4})(?!\d)/i);
  if (m && monthOf(m[1])) return ymd(m[3], monthOf(m[1]), m[2]);
  // Anything else Date can read — its own LOCAL day, i.e. the day as written.
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
