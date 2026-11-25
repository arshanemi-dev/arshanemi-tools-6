// Product Research analytics — pure, shared by the page and the tests.
//
// Input: tracks (lib/research/store.js shape) → products with a daily history
// h: { 'YYYY-MM-DD': { r rank, pg page, p price, m mrp, rt rating, rv reviews, ad } }.
//
// "N days ago" for a product = its snapshot on the latest tracked day on or
// before (reference day − N). No snapshot that far back → null (shown as "-"),
// never a guess. Rank change = rank then − rank now: POSITIVE = moved UP the
// listing (rank 22 → 20 is +2), which is what a seller wants to see grow.

import { daysBetweenISO, shiftDay } from './time';

export const WINDOWS = [
  { id: 'd7', label: '1 Week', days: 7 },
  { id: 'd15', label: '15 Days', days: 15 },
  { id: 'd30', label: '1 Month', days: 30 },
  { id: 'd90', label: '3 Months', days: 90 },
];

// Merge every track's products into one map (a product in two tracks — the
// same link under two keywords — keeps the history of the first one given).
export function mergeProducts(tracks) {
  const out = new Map();
  for (const t of tracks || []) {
    for (const p of Object.values(t?.products || {})) {
      if (!out.has(p.key)) out.set(p.key, { ...p, query: t.query, trackId: t.id });
    }
  }
  return [...out.values()];
}

// Every day any of the products has a snapshot, ascending.
export function allDays(products) {
  const days = new Set();
  for (const p of products) for (const d of Object.keys(p.h || {})) days.add(d);
  return [...days].sort();
}

// The days of `h` inside [from, to] (either may be null = open), ascending.
export function daysIn(h, from, to) {
  return Object.keys(h || {}).filter((d) => (!from || d >= from) && (!to || d <= to)).sort();
}

// The snapshot on the latest day ≤ `onOrBefore` (and ≥ `notBefore`), or null.
export function snapAt(h, onOrBefore, notBefore = null) {
  let best = null;
  for (const d of Object.keys(h || {})) {
    if (d <= onOrBefore && (!notBefore || d >= notBefore) && (!best || d > best)) best = d;
  }
  return best ? { day: best, ...h[best] } : null;
}

const diff = (then, now) => (then == null || now == null ? null : then - now);
const grow = (then, now) => (then == null || now == null ? null : now - then);

// One product's row for the Products table, as of `ref` (the reference day —
// the latest tracked day within the date filter) over [from, ref].
export function productSummary(p, ref, from = null) {
  const days = daysIn(p.h, from, ref);
  const nowSnap = snapAt(p.h, ref, from);
  const first = days.length ? { day: days[0], ...p.h[days[0]] } : null;
  const listedToday = !!p.h?.[ref];
  const cur = nowSnap || {};
  const rankNow = listedToday ? cur.r ?? null : null;
  const moves = {};
  const reviewsGain = {};
  for (const w of WINDOWS) {
    const then = snapAt(p.h, shiftDay(ref, -w.days), from);
    moves[w.id] = then && listedToday ? diff(then.r, rankNow) : null;
    reviewsGain[w.id] = then ? grow(then.rv, cur.rv) : null;
  }
  const ranks = days.map((d) => p.h[d].r).filter((r) => r != null);
  const all = first && listedToday ? diff(first.r, rankNow) : null;
  const mrp = cur.m;
  const price = cur.p;
  const ageDays = p.firstSeen ? daysBetweenISO(ref, p.firstSeen) : null;
  return {
    key: p.key,
    id: p.id,
    platform: p.platform,
    link: p.link,
    title: p.title || p.link,
    image: p.image,
    brand: p.brand,
    query: p.query,
    rank: rankNow,
    page: listedToday ? cur.pg ?? null : null,
    sponsored: !!cur.ad,
    price: price ?? null,
    mrp: mrp ?? null,
    discount: mrp && price != null && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : null,
    rating: cur.rt ?? null,
    reviews: cur.rv ?? null,
    bought: cur.b ?? null,
    moves,
    all,
    reviewsGain,
    ratingChange: first && cur.rt != null && first.rt != null ? Math.round((cur.rt - first.rt) * 10) / 10 : null,
    priceChange: first ? grow(first.p, price) : null,
    bestRank: ranks.length ? Math.min(...ranks) : null,
    daysTracked: days.length,
    firstSeen: p.firstSeen,
    lastSeen: p.lastSeen,
    status: statusOf({ listedToday, ageDays, move: moves.d7 ?? all, sponsored: !!cur.ad }),
  };
}

// One word for where a product is heading — the table's Status column.
export function statusOf({ listedToday, ageDays, move, sponsored }) {
  if (!listedToday) return 'Dropped';
  if (sponsored) return 'Ad';
  if (ageDays != null && ageDays <= 7) return 'New';
  if (move == null) return 'Stable';
  if (move >= 3) return 'Rising';
  if (move <= -3) return 'Falling';
  return 'Stable';
}

// The reference day for a date filter: the latest day with any snapshot
// that is ≤ `to` (or the latest of all when `to` is null).
export function referenceDay(products, to = null) {
  const days = allDays(products).filter((d) => !to || d <= to);
  return days.length ? days[days.length - 1] : null;
}

// The Daily History table — one row per product per day, the user's sheet
// layout: Link, Date, Price, Review, Rating, Ranking, then the rank change
// against 1 Week / 15 Days / 1 Month / 3 Months / All time before THAT day.
export function dailyRows(products, from = null, to = null) {
  const rows = [];
  for (const p of products) {
    const days = daysIn(p.h, null, to);
    const first = days[0];
    for (const d of days) {
      if (from && d < from) continue;
      const s = p.h[d];
      const moves = {};
      for (const w of WINDOWS) {
        const then = snapAt(p.h, shiftDay(d, -w.days));
        moves[w.id] = then ? diff(then.r, s.r) : null;
      }
      rows.push({
        key: `${p.key}|${d}`,
        productKey: p.key,
        platform: p.platform,
        link: p.link,
        title: p.title || p.link,
        date: d,
        price: s.p ?? null,
        mrp: s.m ?? null,
        reviews: s.rv ?? null,
        bought: s.b ?? null,
        rating: s.rt ?? null,
        rank: s.r ?? null,
        page: s.pg ?? null,
        sponsored: !!s.ad,
        moves,
        all: d !== first ? diff(p.h[first].r, s.r) : null,
      });
    }
  }
  return rows;
}

// Chart series for `metric` ('rank' | 'reviews' | 'rating' | 'price' | 'bought') over
// the `days` days ending at `ref`, one per product: [{ key, title,
// platform, points: [{ t, value }] }]. Days a product has no value are left
// out (a gap, not a 0).
const FIELD = { rank: 'r', reviews: 'rv', rating: 'rt', price: 'p', bought: 'b' };
export function seriesFor(products, metric, ref, days) {
  const from = shiftDay(ref, -(days - 1));
  const f = FIELD[metric];
  return products.map((p) => ({
    key: p.key,
    title: p.title || p.link,
    platform: p.platform,
    points: daysIn(p.h, from, ref).map((t) => ({ t, value: p.h[t][f] })).filter((pt) => pt.value != null),
  }));
}

// The x axis for a chart of `series` over the `days` days ending at `ref`:
// every day from the first one any series has (inside the window) to `ref` —
// so a 3-month range on a 3-day-old search isn't a mostly empty chart.
export function chartDays(series, ref, days) {
  if (!ref) return [];
  const windowStart = shiftDay(ref, -(days - 1));
  const first = series.flatMap((s) => s.points.map((p) => p.t)).filter((t) => t >= windowStart).sort()[0];
  if (!first) return [];
  const out = [];
  for (let d = first; d <= ref; d = shiftDay(d, 1)) out.push(d);
  return out;
}

// KPI cards over the summaries shown (after filters).
export function kpis(rows) {
  const vals = (k) => rows.map((r) => r[k]).filter((v) => v != null);
  const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const listed = rows.filter((r) => r.status !== 'Dropped');
  return {
    products: rows.length,
    listed: listed.length,
    avgPrice: avg(vals('price')),
    avgRating: avg(vals('rating')),
    totalReviews: vals('reviews').reduce((s, v) => s + v, 0),
    rising: rows.filter((r) => r.status === 'Rising').length,
    falling: rows.filter((r) => r.status === 'Falling').length,
    newcomers: rows.filter((r) => r.status === 'New').length,
    reviewsGain7: rows.map((r) => r.reviewsGain.d7).filter((v) => v != null).reduce((s, v) => s + v, 0),
    bought: vals('bought').reduce((s, v) => s + v, 0),
    boughtProducts: vals('bought').length,
  };
}
