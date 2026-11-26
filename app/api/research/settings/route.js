import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { readUserSearches } from '@/lib/research/store'
import { searchesWithStats, storageSummary } from '@/lib/research/cleanup'

export const runtime = 'nodejs'

// GET → { searches (each with products, days, lastRead), isAdmin, storage? }
// — the Settings page. `storage` (lib/research/cleanup.js storageSummary)
// only for the master admin.
export async function GET(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isAdmin = payload.role === 'master_admin'
  const [searches, storage] = await Promise.all([
    readUserSearches(payload.userId).then(searchesWithStats),
    isAdmin ? storageSummary() : null,
  ])
  return NextResponse.json({ searches, isAdmin, ...(storage ? { storage } : {}) })
}
