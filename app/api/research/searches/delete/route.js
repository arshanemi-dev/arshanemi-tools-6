import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { deleteSearches } from '@/lib/research/cleanup'

export const runtime = 'nodejs'

// POST { ids: [searchId, …] } or { all: true } — delete several (or all) of
// the user's own searches at once (Settings). Same rules as DELETE
// /api/research/searches/[id]. → { ok, searches, deletedData, keptShared }
export async function POST(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const ids = body.all === true
    ? 'all'
    : (Array.isArray(body.ids) ? body.ids : []).filter((id) => typeof id === 'string' && id.length <= 64).slice(0, 500)
  if (ids !== 'all' && !ids.length) return NextResponse.json({ error: 'Pick at least one search to delete' }, { status: 400 })
  return NextResponse.json({ ok: true, ...(await deleteSearches(payload.userId, ids)) })
}
