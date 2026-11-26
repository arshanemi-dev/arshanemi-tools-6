import { NextResponse } from 'next/server'
import { signedIn } from '@/lib/research/access'
import { renewEntries } from '@/lib/research/subscriptions'

export const runtime = 'nodejs'

// POST {} — the monthly renewal: the user's saved entries whose month ran
//   out (and that renew themselves) are charged a month each. The pages call
//   it on the first visit after a month ends (GET /api/research/entries says
//   which are `due`). Too few coins → those entries turn Expired (never into
//   debt) and the answer says why, so the page shows the coins window.
// POST { ids: [entryId] } — Renew by hand: these Expired entries, a month
//   each; they go back on the list and renew themselves again.
// → { renewed: [{ id, paidUntil }], lapsed: [id], coins, remainingCoins,
//     blocked: { reason, data } | null, error: string | null }
//   (always 200 — what was renewed is kept even when a later one was refused)
export async function POST(req) {
  const { payload, res } = await signedIn(req)
  if (res) return res
  const body = await req.json().catch(() => ({}))
  const list = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x) => typeof x === 'string' && x && x.length <= 64))].slice(0, 100) : null
  if (list && !list.length) return NextResponse.json({ error: 'Pick at least one entry to renew' }, { status: 400 })
  return NextResponse.json(await renewEntries(req, payload, list))
}
