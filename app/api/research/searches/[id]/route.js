import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { readUserSearches, updateUserSearches } from '@/lib/research/store'
import { searchPayload } from '@/lib/research/service'

export const runtime = 'nodejs'

async function ownSearch(req, params) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { id } = await params
  const search = (await readUserSearches(payload.userId)).find((s) => s.id === id)
  if (!search) return { res: NextResponse.json({ error: 'Search not found' }, { status: 404 }) }
  return { payload, search }
}

// GET → { search, tracks, status } — everything the page needs to draw it.
export async function GET(req, { params }) {
  const { res, search } = await ownSearch(req, params)
  if (res) return res
  return NextResponse.json(await searchPayload(search))
}

// DELETE → removes it from the user's list. The shared track data stays (other
// users may track the same keyword); a coin already paid is not refunded.
export async function DELETE(req, { params }) {
  const { res, payload, search } = await ownSearch(req, params)
  if (res) return res
  await updateUserSearches(payload.userId, (list) => list.filter((s) => s.id !== search.id))
  return NextResponse.json({ ok: true })
}
