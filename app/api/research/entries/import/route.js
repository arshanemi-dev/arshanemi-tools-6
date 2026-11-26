import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { marketplaceOfLink } from '@/data/marketplaces'
import { toISODate } from '@/lib/table/parse'
import { adminOnly } from '@/lib/research/access'
import { saveImport } from '@/lib/research/store'
import { slugify, updateEntries } from '@/lib/research/entries'

export const runtime = 'nodejs'

const MAX_ROWS = 20000
const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

// POST { name, rows: [{ link, date, title?, price?, mrp?, rating?, reviews?, rank?, bought? }] }
// — the master admin imports a sheet (read in the browser:
// lib/research/importSheet.js) as an entry named "import_<file name>".
// Importing the same name again merges into it (a link + date already there
// takes the sheet's values). → { entry, imported, skipped }
export async function POST(req) {
  const { res } = await adminOnly(req)
  if (res) return res
  const body = await req.json().catch(() => ({}))
  const label = String(body.name ?? '').trim().slice(0, 80) || 'sheet'
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
      link, date, platform: marketplaceOfLink(link), title: String(r.title ?? '').trim().slice(0, 300),
      price: n(r.price), mrp: n(r.mrp), rating: rating != null && rating >= 0 && rating <= 5 ? rating : null, reviews: n(r.reviews),
      bought: n(r.bought) != null && n(r.bought) >= 0 ? Math.round(n(r.bought)) : null,
      rank: n(r.rank) != null && n(r.rank) >= 1 ? Math.round(n(r.rank)) : null,
    })
  }
  if (!rows.length) return NextResponse.json({ error: 'No row has both a product Link (http…) and a Date', skipped }, { status: 422 })

  const name = `import_${slugify(label) || 'sheet'}`
  const trackId = `import-${createHash('sha1').update(name).digest('hex').slice(0, 10)}-${slugify(label) || 'sheet'}`
  await saveImport({ id: trackId, query: name }, rows)
  let entry
  await updateEntries((list) => {
    entry = list.find((e) => e.name === name)
    if (entry) return list
    entry = { id: createHash('sha1').update(`${name}|${Date.now()}`).digest('hex').slice(0, 12), name, platform: 'mixed', category: label, url: null, kind: 'import', fromPage: 0, toPage: 0, autoDaily: false, trackId, createdAt: new Date().toISOString() }
    return [entry, ...list]
  })
  return NextResponse.json({ entry, imported: rows.length, skipped })
}
