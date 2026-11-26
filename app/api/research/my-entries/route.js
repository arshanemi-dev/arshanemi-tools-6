import { NextResponse } from 'next/server'
import { signedIn } from '@/lib/research/access'
import { changeMyEntries, readEntries } from '@/lib/research/entries'

export const runtime = 'nodejs'

// POST { add?: [entryId], remove?: [entryId] } — any signed-in user saves
// entries to (or removes them from) their OWN list, on the My Entries page
// (/product-research/my-entries). Product Research's Entries ▾ lists only
// the saved ones. Saving costs nothing and doesn't unlock an entry.
// The list itself comes with GET /api/research/entries (`myEntries`).
// → { myEntries, added, removed, unknown } | 400 { error }
const MAX_AT_ONCE = 500

export async function POST(req) {
  const { payload, res } = await signedIn(req)
  if (res) return res
  const body = await req.json().catch(() => ({}))
  const ids = (v) => [...new Set((Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && x && x.length <= 64))]
  const add = ids(body.add)
  const remove = ids(body.remove)
  if (!add.length && !remove.length) return NextResponse.json({ error: 'Pick at least one entry to add or remove' }, { status: 400 })
  if (add.length + remove.length > MAX_AT_ONCE) return NextResponse.json({ error: `At most ${MAX_AT_ONCE} entries at once` }, { status: 400 })
  const existing = (await readEntries()).map((e) => e.id)
  const out = await changeMyEntries(payload.userId, { add, remove }, existing)
  if (add.length && out.unknown.length === add.length && !remove.length) {
    return NextResponse.json({ error: add.length === 1 ? 'That entry doesn’t exist any more' : 'Those entries don’t exist any more' }, { status: 400 })
  }
  return NextResponse.json(out)
}
