// One product's history in steps — the Details window on Daily History
// (components/research/ProductHistoryModal.jsx). Pure (the page, the tests).
//
// A period ends on the reference day (the latest tracked day in the date
// filter) and is cut into steps — the table's columns, oldest first:
//   3 Days / 1 Week / 15 Days  one column per day: the latest day + the days
//                              before it (1 Week = 7 columns)
//   1 Month                    the last 30 days in weeks: Week 1 … Week 5
//                              (7 days each; Week 5 = the last 2 days)
//   All Time                   one column per calendar month: Nov 2026, …
// Each row is a measure, worked out per step, then over the whole period:
//   Rank, Price, Rating, Bought  the average of the step's days
//   Reviews                      the count on the step's last day
//   Reviews gained               new reviews during the step (Total = all)
//   Days tracked                 days with a snapshot (Total = all)
// A step with no snapshot is null ("-"), never a 0 or a guess.

import { shiftDay } from './time';

export const PERIODS = [
  { id: 'd3', label: '3 Days', step: 'day', days: 3 },
  { id: 'd7', label: '1 Week', step: 'day', days: 7 },
  { id: 'd15', label: '15 Days', step: 'day', days: 15 },
  { id: 'm1', label: '1 Month', step: 'week', days: 30 },
  { id: 'all', label: 'All Time', step: 'month' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDay = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const monthName = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const lastOfMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const nextMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

// The steps of a period ending on `ref` → [{ id, label, sub, from, to }],
// oldest first. `firstDay` = the product's first snapshot (All Time starts
// at its month).
export function stepsOf(periodId, ref, firstDay = null) {
  const p = PERIODS.find((x) => x.id === periodId) || PERIODS[1];
  if (!ref) return [];
  if (p.step === 'day') {
    const out = [];
    for (let i = p.days - 1; i >= 0; i -= 1) {
      const d = shiftDay(ref, -i);
      out.push({ id: d, label: shortDay(d), sub: i === 0 ? 'latest' : `${i} day${i === 1 ? '' : 's'} before`, from: d, to: d });
    }
    return out;
  }
  if (p.step === 'week') {
    const start = shiftDay(ref, -(p.days - 1));
    const out = [];
    for (let w = 0; w * 7 < p.days; w += 1) {
      const from = shiftDay(start, w * 7);
      const end = shiftDay(from, 6);
      const to = end > ref ? ref : end;
      out.push({ id: `w${w + 1}`, label: `Week ${w + 1}`, sub: from === to ? shortDay(from) : `${shortDay(from)} – ${shortDay(to)}`, from, to });
    }
    return out;
  }
  const out = [];
  const last = ref.slice(0, 7);
  for (let ym = (firstDay && firstDay <= ref ? firstDay : ref).slice(0, 7); ym <= last; ym = nextMonth(ym)) {
    const to = ym === last ? ref : lastOfMonth(ym);
    out.push({ id: ym, label: monthName(ym), sub: ym === last ? `to ${shortDay(ref)}` : '', from: `${ym}-01`, to });
  }
  return out;
}

const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
const round = (v, places) => (v == null ? null : Math.round(v * 10 ** places) / 10 ** places);

// Measures: snapshot field, how a step is summed up, decimals kept.
export const ROWS = [
  { id: 'rank', label: 'Rank', field: 'r', kind: 'avg', places: 1, invert: true },
  { id: 'price', label: 'Price', field: 'p', kind: 'avg', places: 0 },
  { id: 'reviews', label: 'Reviews', field: 'rv', kind: 'last', places: 0 },
  { id: 'gained', label: 'Reviews gained', field: 'rv', kind: 'gain', places: 0 },
  { id: 'rating', label: 'Rating', field: 'rt', kind: 'avg', places: 2 },
  { id: 'bought', label: 'Bought / Month', field: 'b', kind: 'avg', places: 0 },
  { id: 'days', label: 'Days tracked', kind: 'count', places: 0 },
];

// One product over a period → { steps, rows: [{ ...ROW, values: [per step],
// average, total }], days (snapshot days in the period) }.
export function historyTable(product, periodId, ref) {
  const h = product?.h || {};
  const all = Object.keys(h).sort();
  const steps = stepsOf(periodId, ref, all[0]);
  if (!steps.length) return { steps, rows: [], days: [] };
  const from = steps[0].from;
  const to = steps[steps.length - 1].to;
  const daysOf = (a, b) => all.filter((d) => d >= a && d <= b);
  const periodDays = daysOf(from, to);
  const val = (d, f) => (h[d]?.[f] ?? null);
  const lastBefore = (day, f) => {
    for (let i = all.length - 1; i >= 0; i -= 1) if (all[i] < day && val(all[i], f) != null) return val(all[i], f);
    return null;
  };

  const rows = ROWS.map((row) => {
    let values;
    let average = null;
    let total = null;
    if (row.kind === 'count') {
      values = steps.map((s) => daysOf(s.from, s.to).length);
      total = values.reduce((n, v) => n + v, 0);
    } else if (row.kind === 'gain') {
      values = steps.map((s) => {
        const seen = daysOf(s.from, s.to).map((d) => val(d, row.field)).filter((v) => v != null);
        if (!seen.length) return null;
        const before = lastBefore(s.from, row.field);
        return seen[seen.length - 1] - (before ?? seen[0]);
      });
      const known = values.filter((v) => v != null);
      total = known.length ? known.reduce((n, v) => n + v, 0) : null;
      average = round(mean(known), 1);
    } else if (row.kind === 'last') {
      values = steps.map((s) => {
        const seen = daysOf(s.from, s.to).map((d) => val(d, row.field)).filter((v) => v != null);
        return seen.length ? seen[seen.length - 1] : null;
      });
    } else {
      values = steps.map((s) => round(mean(daysOf(s.from, s.to).map((d) => val(d, row.field)).filter((v) => v != null)), row.places));
      // Over the whole period: the average of every day (not of the steps).
      average = round(mean(periodDays.map((d) => val(d, row.field)).filter((v) => v != null)), row.places);
    }
    return { ...row, values, average, total };
  });
  return { steps, rows, days: periodDays };
}

// The trend of a row's step values: a straight best-fit line through them.
//   line       the line's value at every step (drawn dashed on the chart)
//   angle      how steep it is, in degrees: atan(change along the line ÷
//              the average) — 0° flat, ±45° = it moved by its own average
//              size over the period. + = better for rank (`invert`: a smaller
//              number), + = higher for everything else.
//   direction  'up' | 'down' | 'flat' (within ±2°), in that same sense
//   first, last, growth (last − first; rank: places climbed = first − last),
//   growthPct  (+ = the number grew)
// → null with fewer than 2 values.
export function trendOf(values, { invert = false } = {}) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null && Number.isFinite(v));
  if (pts.length < 2) return null;
  const mx = mean(pts.map(([x]) => x));
  const my = mean(pts.map(([, y]) => y));
  let num = 0;
  let den = 0;
  for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  const slope = den ? num / den : 0;
  const intercept = my - slope * mx;
  const along = slope * (pts[pts.length - 1][0] - pts[0][0]);
  const better = invert ? -along : along;
  const angle = round((Math.atan(better / (Math.abs(my) || 1)) * 180) / Math.PI, 1);
  const first = pts[0][1];
  const last = pts[pts.length - 1][1];
  return {
    slope,
    line: values.map((_, i) => intercept + slope * i),
    angle,
    direction: angle > 2 ? 'up' : angle < -2 ? 'down' : 'flat',
    first,
    last,
    growth: round(invert ? first - last : last - first, 2),
    growthPct: first ? round(((last - first) / Math.abs(first)) * 100, 1) : null,
  };
}
