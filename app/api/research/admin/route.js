import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { cleanUnused, storageSummary, trimHistory, wipeAll } from '@/lib/research/cleanup'

export const runtime = 'nodejs'
export const maxDuration = 300

const TRIM_DAYS = [30, 90, 180, 365]

// POST — the master admin's storage actions (New Search page › All data):
//   { action: 'clean-unused' }              delete saved data no entry uses (and old per-user search lists)
//   { action: 'trim', days: 30|90|180|365 } delete every snapshot older than that
//   { action: 'wipe', confirm: 'DELETE' }    delete ALL Product Research data (accounts and coins are the hub's — untouched)
// → { ok, result, storage } (storage = the summary after it).
export async function POST(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'master_admin') return NextResponse.json({ error: 'Only the master admin can do this' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  let result
  if (body.action === 'clean-unused') {
    result = await cleanUnused()
  } else if (body.action === 'trim') {
    const days = Number(body.days)
    if (!TRIM_DAYS.includes(days)) return NextResponse.json({ error: `days must be one of ${TRIM_DAYS.join(', ')}` }, { status: 400 })
    result = await trimHistory(days)
  } else if (body.action === 'wipe') {
    if (body.confirm !== 'DELETE') return NextResponse.json({ error: 'Type DELETE to confirm' }, { status: 400 })
    result = await wipeAll()
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
  console.info(`[research] admin ${body.action} by ${payload.userId}:`, JSON.stringify(result))
  return NextResponse.json({ ok: true, result, storage: await storageSummary() })
}
