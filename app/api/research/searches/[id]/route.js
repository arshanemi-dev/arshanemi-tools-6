import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { readUserSearches } from '@/lib/research/store'
import { searchPayload } from '@/lib/research/service'
import { deleteSearches } from '@/lib/research/cleanup'

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

// DELETE → removes it from the user's list (lib/research/cleanup.js
// deleteSearches): an imported sheet's data is deleted; a keyword / link
// nobody else tracks stops being read every day and its data is deleted;
// one someone else tracks stays for them. Coins already used aren't refunded.
// → { ok, searches, deletedData, keptShared }
export async function DELETE(req, { params }) {
  const { res, payload, search } = await ownSearch(req, params)
  if (res) return res
  return NextResponse.json({ ok: true, ...(await deleteSearches(payload.userId, [search.id])) })
}
