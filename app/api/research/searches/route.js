import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { PR_BILLING } from '@/data/billing'
import { readUserSearches, searchCount } from '@/lib/research/store'

export const runtime = 'nodejs'

// GET → { searches, freeLeft, coinsPerSearch } — the user's tracked
// searches (newest first) and what their next search costs.
export async function GET(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const searches = await readUserSearches(payload.userId)
  const paid = process.env.NEXT_PUBLIC_IS_PAID === 'true' && payload.role !== 'master_admin'
  return NextResponse.json({
    searches,
    freeLeft: paid ? Math.max(0, PR_BILLING.freeSearches - searchCount(searches)) : Infinity,
    coinsPerSearch: paid ? PR_BILLING.displayCoins : 0,
  })
}
