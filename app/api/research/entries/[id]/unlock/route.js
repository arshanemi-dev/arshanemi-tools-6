import { NextResponse } from 'next/server'
import { PR_BILLING } from '@/data/billing'
import { isAdmin, signedIn } from '@/lib/research/access'
import { addUnlocked, entryAsSearch, readEntries, readUnlocked } from '@/lib/research/entries'
import { runServerBillingGate } from '@/lib/serverBilling'
import { searchPayload } from '@/lib/research/service'

export const runtime = 'nodejs'

// POST → unlock one entry for this user, for good (data/billing.js): their
// first unlock is free, each later one is charged once (1 × pr-search, 10
// coins) — never twice for the same entry (idempotency key user + entry).
// → { search, tracks, status, charged: { coins, free } }
//   402 { status: 'blocked', reason, data } — BillingGateModal's shape
export async function POST(req, { params }) {
  const { payload, res } = await signedIn(req)
  if (res) return res
  const { id } = await params
  const entry = (await readEntries()).find((e) => e.id === id)
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  const unlocked = await readUnlocked(payload.userId)
  const already = isAdmin(payload) || unlocked.includes(id)
  const free = !already && unlocked.length < PR_BILLING.freeUnlocks
  let coins = 0
  if (!already && !free) {
    try {
      const gate = await runServerBillingGate(req, {
        toolSlug: PR_BILLING.toolSlug, featureApiIdentifier: PR_BILLING.searchFeature, quantity: 1, idempotencyKey: `pr-unlock:${payload.userId}:${id}`,
      })
      if (gate.status !== 'proceed') {
        return NextResponse.json({ status: 'blocked', reason: gate.reason, data: { ...gate.data, note: 'Nothing was unlocked. Add coins and try again — you won’t be charged twice for the same entry.' } }, { status: 402 })
      }
      coins = gate.data?.duplicate ? 0 : gate.data?.coinsCost || 0
    } catch (err) {
      console.error('product-research unlock charge failed:', err)
      return NextResponse.json({ error: 'Your coins couldn’t be checked right now — try again in a moment.' }, { status: 503 })
    }
  }
  if (!isAdmin(payload) && !unlocked.includes(id)) await addUnlocked(payload.userId, id)
  const shown = isAdmin(payload) ? entry : { ...entry, url: undefined, autoDaily: undefined }
  return NextResponse.json({ ...(await searchPayload(entryAsSearch(shown))), charged: { coins, free, already } })
}
