import { NextResponse } from 'next/server'
import { adminOnly } from '@/lib/research/access'
import { deleteEntries } from '@/lib/research/cleanup'

export const runtime = 'nodejs'

// POST { ids: [entryId, …] } or { all: true } — the master admin deletes
// entries and their saved data (kept only while another entry reads the
// same page and range). → { ok, entries, deletedData, keptShared }
export async function POST(req) {
  const { res } = await adminOnly(req)
  if (res) return res
  const body = await req.json().catch(() => ({}))
  const ids = body.all === true ? 'all' : (Array.isArray(body.ids) ? body.ids : []).filter((x) => typeof x === 'string').slice(0, 500)
  if (ids !== 'all' && !ids.length) return NextResponse.json({ error: 'Tick at least one entry to delete' }, { status: 400 })
  return NextResponse.json({ ok: true, ...(await deleteEntries(ids)) })
}
