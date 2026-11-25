// "Today" for snapshots is the Indian calendar day — the server runs in UTC,
// where 00:00–05:30 IST is still yesterday. Pure.
const IST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

export const todayIST = (now = new Date()) => IST.format(now);

// "YYYY-MM-DD" ± n days → "YYYY-MM-DD" (calendar maths in UTC, no DST drift).
export function shiftDay(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function daysBetweenISO(a, b) {
  const ta = Date.UTC(...a.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  const tb = Date.UTC(...b.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Math.round((ta - tb) / 86400000);
}
