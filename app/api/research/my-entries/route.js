import { NextResponse } from 'next/server'
import { signedIn } from '@/lib/research/access'
import { readEntries } from '@/lib/research/entries'
import { addEntries, removeEntries } from '@/lib/research/subscriptions'

export const runtime = 'nodejs'

// The My Entries page (/product-research/my-entries) — any signed-in user,
// their OWN list (data/billing.js, lib/research/subscriptions.js).
//
// POST { add: [entryId], requestId } — add entries: each one not paid for
//   right now costs one month (pr-entry-month, 5000 coins in the catalog),
//   charged here, all in one go — nothing is added unless it all went
//   through. `requestId` = the click's id: a retry of the same click is free.
//   → 200 { myEntries, added, charged: { coins, entries, remainingCoins } }
//   → 402 { status: 'blocked', reason, data } — BillingGateModal's shape
//     (not enough coins, coins expired, tool not granted, …)
// POST { remove: [entryId] } — take entries off the list: they stop renewing
//   (the month already paid isn't refunded). → { myEntries, removed }
// The list itself comes with GET /api/research/entries.
const MAX_AT_ONCE = 100
const ids = (v) => [...new Set((Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && x && x.length <= 64))]

export async function POST(req) {
  const { payload, res } = await signedIn(req)
  if (res) return res
  const body = await req.json().catch(() => ({}))
  const add = ids(body.add)
  const remove = ids(body.remove)
  if (add.length && remove.length) return NextResponse.json({ error: 'Add and remove in separate requests' }, { status: 400 })
  if (!add.length && !remove.length) return NextResponse.json({ error: 'Pick at least one entry to add or remove' }, { status: 400 })
  if (add.length + remove.length > MAX_AT_ONCE) return NextResponse.json({ error: `At most ${MAX_AT_ONCE} entries at once` }, { status: 400 })

  if (remove.length) return NextResponse.json(await removeEntries(payload.userId, remove))

  const existing = (await readEntries()).map((e) => e.id)
  if (!add.some((id) => existing.includes(id))) {
    return NextResponse.json({ error: add.length === 1 ? 'That entry doesn’t exist any more' : 'Those entries don’t exist any more' }, { status: 400 })
  }
  const requestId = typeof body.requestId === 'string' ? body.requestId.slice(0, 64) : ''
  const out = await addEntries(req, payload, add, { requestId, existing })
  if (out.error) return NextResponse.json({ error: out.error }, { status: 503 })
  if (out.blocked) return NextResponse.json({ status: 'blocked', ...out.blocked }, { status: 402 })
  return NextResponse.json(out)
}
