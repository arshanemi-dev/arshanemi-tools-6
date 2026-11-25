'use client';

// A product-history sheet the user already has (Excel / CSV) → rows for
// POST /api/research/import. The layout is the one this tool exports in its
// Daily History view, so an export can be imported back:
//   Link | Date | Price | Review | Rating | Ranking  (+ optional Title, MRP)
// Headers are matched loosely (any case, "Reviews" / "Review Count",
// "Rank" / "Ranking", "URL" / "Product Link", …) and may sit on any of the
// first 10 rows — a title row above them (e.g. "Date Filter | Start | End")
// is skipped. Columns it doesn't know are ignored.

const ALIASES = {
  link: ['link', 'url', 'product link', 'product url', 'productlink'],
  date: ['date', 'day', 'snapshot date'],
  title: ['title', 'name', 'product', 'product name', 'product title'],
  price: ['price', 'selling price', 'sale price'],
  mrp: ['mrp', 'list price', 'original price'],
  reviews: ['review', 'reviews', 'review count', 'reviews count', 'ratings count', 'rating count', 'no of reviews'],
  rating: ['rating', 'ratings', 'stars', 'avg rating', 'average rating'],
  rank: ['ranking', 'rank', 'position', 'bsr'],
  bought: ['bought', 'sold', 'units sold', 'bought in past month', 'monthly sales'],
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function fieldOf(header) {
  const h = norm(header);
  for (const [field, names] of Object.entries(ALIASES)) if (names.includes(h)) return field;
  return null;
}

// → { rows, columns: { field: headerText }, error }
export async function readResearchSheet(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], columns: {}, error: 'The file has no sheet' };
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

  let headerRow = -1;
  let map = {};
  for (let i = 0; i < Math.min(10, grid.length); i += 1) {
    const m = {};
    grid[i].forEach((cell, col) => {
      const f = fieldOf(cell);
      if (f && m[f] == null) m[f] = col;
    });
    if (m.link != null && m.date != null) { headerRow = i; map = m; break; }
  }
  if (headerRow === -1) return { rows: [], columns: {}, error: 'No header row with both a "Link" and a "Date" column was found in the first 10 rows' };

  const rows = [];
  for (const line of grid.slice(headerRow + 1)) {
    const get = (f) => (map[f] == null ? null : line[map[f]]);
    const link = String(get('link') ?? '').trim();
    if (!link) continue;
    rows.push({ link, date: get('date'), title: get('title'), price: get('price'), mrp: get('mrp'), reviews: get('reviews'), rating: get('rating'), rank: get('rank'), bought: get('bought') });
  }
  const columns = Object.fromEntries(Object.entries(map).map(([f, col]) => [f, grid[headerRow][col]]));
  return { rows, columns, error: rows.length ? null : 'The sheet has a header row but no product rows under it' };
}
