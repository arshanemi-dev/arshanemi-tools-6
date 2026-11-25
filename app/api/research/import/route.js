import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { marketplaceOfLink } from '@/data/marketplaces'
import { toISODate } from '@/lib/table/parse'
import { importTrackId, normQuery, readUserSearches, saveImport, updateUserSearches } from '@/lib/research/store'
import { searchPayload } from '@/lib/research/service'

export const runtime = 'nodejs'

const MAX_ROWS = 20000
const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

// POST { name, rows: [{ link, date, title?, price?, mrp?, rating?, reviews?, rank? }] }
// — a sheet the user already has (the browser read it: lib/research/importSheet.js)
// added to their research as its own search, the same tables and graphs as
// a scraped one. Free. Importing again under the same name merges: a link +
// date already there takes the sheet's new values.
export async function POST(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim().slice(0, 80) || 'Imported sheet'
  const raw = Array.isArray(body.rows) ? body.rows : []
  if (!raw.length) return NextResponse.json({ error: 'The sheet has no rows' }, { status: 400 })
  if (raw.length > MAX_ROWS) return NextResponse.json({ error: `At most ${MAX_ROWS.toLocaleString('en-IN')} rows per import` }, { status: 400 })

  const rows = []
  let skipped = 0
  for (const r of raw) {
    const link = String(r?.link ?? '').trim()
    const date = toISODate(r?.date)
    if (!/^https?:\/\//i.test(link) || !date) { skipped += 1; continue }
    const rating = n(r.rating)
    rows.push({
      link,
      date,
      platform: marketplaceOfLink(link),
      title: String(r.title ?? '').trim().slice(0, 300),
      price: n(r.price),
      mrp: n(r.mrp),
      rating: rating != null && rating >= 0 && rating <= 5 ? rating : null,
      reviews: n(r.reviews),
      bought: n(r.bought) != null && n(r.bought) >= 0 ? Math.round(n(r.bought)) : null,
      rank: n(r.rank) != null && n(r.rank) >= 1 ? Math.round(n(r.rank)) : null,
    })
  }
  if (!rows.length) return NextResponse.json({ error: 'No row has both a product Link (http…) and a Date', skipped }, { status: 422 })

  const trackId = importTrackId(payload.userId, name)
  await saveImport({ id: trackId, query: name }, rows)

  const existing = (await readUserSearches(payload.userId)).find((s) => s.kind === 'import' && normQuery(s.query) === normQuery(name))
  const search = existing || {
    id: trackId.slice(-16), kind: 'import', query: name, platforms: [...new Set(rows.map((r) => r.platform))],
    trackIds: [trackId], createdAt: new Date().toISOString(), coinsCharged: 0, free: true,
  }
  if (existing) search.platforms = [...new Set([...existing.platforms, ...rows.map((r) => r.platform)])]
  await updateUserSearches(payload.userId, (list) => [search, ...list.filter((s) => s.id !== search.id)])

  return NextResponse.json({ ...(await searchPayload(search)), imported: rows.length, skipped })
}
