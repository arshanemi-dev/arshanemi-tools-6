import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { getAuthPayload } from '@/lib/auth'
import { runServerBillingGate } from '@/lib/serverBilling'
import { tooManyAttempts, MINUTES } from '@/lib/rateLimit'
import { PR_BILLING } from '@/data/billing'
import { DEFAULT_RANGE, MARKETPLACE_IDS, MAX_URLS, listingLabel, pageRange, rangeProblem, readListingUrl } from '@/data/marketplaces'
import { normQuery, readUserSearches, registerTracks, searchCount, updateUserSearches } from '@/lib/research/store'
import { ensureFresh, jobsOf, planOf, searchPayload } from '@/lib/research/service'
import { ndjson } from '@/lib/research/stream'

export const runtime = 'nodejs'
// Several marketplaces × several result pages, politely paced.
export const maxDuration = 300

// POST { mode: 'category', query, platforms: ['amazon', …], fromPage, toPage }
//   or { mode: 'url', urls: ['https://www.flipkart.com/…', …], fromPage, toPage }
//
// Bad input → a plain JSON error (400). Otherwise the answer is a live stream
// (lib/research/stream.js): { type: 'plan', jobs } · { type: 'progress', id,
// state, page, pages, products } per marketplace / link as it is read · then
// { type: 'result', data: { search, tracks, status, charged } } or
// { type: 'error', status, … } — 402 { reason, data } is BillingGateModal's
// shape; 422 = nothing could be read (nothing charged).
//
// Billing (data/billing.js): a user's first search is free; each later one
// (a keyword, or a set of links) is charged once (pr-search) — AFTER the
// read found products, so a search that comes back empty or blocked never
// costs coins. One the user already tracks (same keyword + marketplaces, or
// same links, + same page range) is just reopened.
export async function POST(req) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limited = tooManyAttempts(req, 'research-search', { limit: 20, windowMs: 10 * MINUTES, subject: payload.userId, subjectLimit: 10 })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const range = body.fromPage == null && body.toPage == null && body.pages == null ? DEFAULT_RANGE : pageRange(body)
  const badRange = rangeProblem(range)
  if (badRange) return NextResponse.json({ error: badRange }, { status: 400 })
  const { fromPage, toPage } = range

  // ── what to read ──
  let draft
  if (body.mode === 'url') {
    const raw = (Array.isArray(body.urls) ? body.urls : []).map((u) => String(u ?? '').trim()).filter(Boolean)
    if (!raw.length) return NextResponse.json({ error: 'Paste at least one category or search page link' }, { status: 400 })
    if (raw.length > MAX_URLS) return NextResponse.json({ error: `At most ${MAX_URLS} links in one search` }, { status: 400 })
    const read = raw.map(readListingUrl)
    const bad = read.findIndex((r) => r.error)
    if (bad !== -1) return NextResponse.json({ error: `Link ${bad + 1}: ${read[bad].error}` }, { status: 400 })
    const urls = [...new Set(read.map((r) => r.url))]
    const label = urls.length === 1 ? listingLabel(urls[0]) : `${listingLabel(urls[0])} +${urls.length - 1} more`
    draft = { kind: 'url', query: label, urls, platforms: [...new Set(read.map((r) => r.platform))], fromPage, toPage }
  } else {
    const query = String(body.query ?? '').trim().replace(/\s+/g, ' ')
    if (query.length < 2 || query.length > 80) return NextResponse.json({ error: 'Type a category or keyword of 2–80 characters' }, { status: 400 })
    const platforms = [...new Set((Array.isArray(body.platforms) ? body.platforms : MARKETPLACE_IDS).filter((p) => MARKETPLACE_IDS.includes(p)))]
    if (!platforms.length) return NextResponse.json({ error: 'Pick at least one marketplace' }, { status: 400 })
    draft = { kind: 'search', query, platforms, fromPage, toPage }
  }

  const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x))
  const sameRange = (s) => { const r = pageRange(s); return r.fromPage === fromPage && r.toPage === toPage }
  const searches = await readUserSearches(payload.userId)
  const existing = searches.find((s) => sameRange(s) && (draft.kind === 'url'
    ? s.kind === 'url' && sameSet(s.urls, draft.urls)
    : (s.kind || 'search') === 'search' && normQuery(s.query) === normQuery(draft.query) && sameSet(s.platforms, draft.platforms)))
  const free = !existing && searchCount(searches) < PR_BILLING.freeSearches

  return ndjson(async (send) => {
    send({ type: 'plan', kind: draft.kind, label: draft.query, fromPage, toPage, jobs: planOf(draft) })
    const results = await ensureFresh(draft, { onProgress: (p) => send({ type: 'progress', ...p }) })
    const found = results.reduce((n, r) => n + Object.keys(r.track?.products || {}).length, 0)
    const perJob = results.map((r) => ({ id: r.id, platform: r.platform, label: r.label, error: r.error, blocked: r.blocked, products: Object.keys(r.track?.products || {}).length }))
    if (!found) {
      send({ type: 'error', status: 422, error: 'No products could be read for this search — nothing was charged.', results: perJob })
      return
    }

    let coins = 0
    if (!existing && !free) {
      const what = draft.kind === 'url' ? [...draft.urls].sort().join(' ') : `${normQuery(draft.query)}|${[...draft.platforms].sort().join(',')}`
      const key = createHash('sha256').update(`${payload.userId}|${what}|${fromPage === 1 ? toPage : `${fromPage}-${toPage}`}`).digest('hex')
      try {
        const gate = await runServerBillingGate(req, {
          toolSlug: PR_BILLING.toolSlug, featureApiIdentifier: PR_BILLING.searchFeature, quantity: 1, idempotencyKey: `pr-search:${key}`,
        })
        if (gate.status !== 'proceed') {
          console.info('[research] search charge refused:', gate.reason)
          send({ type: 'error', status: 402, reason: gate.reason, data: { ...gate.data, note: 'The search was not added. Add coins and search again — you won’t be charged twice for the same search.' } })
          return
        }
        coins = gate.data?.duplicate ? 0 : gate.data?.coinsCost || 0
      } catch (err) {
        console.error('product-research search charge failed:', err)
        send({ type: 'error', status: 503, error: 'Your coins couldn’t be checked right now — try again in a moment.' })
        return
      }
    }

    const trackIds = jobsOf(draft).map((j) => j.id)
    let search = existing
    if (!existing) {
      search = { id: createHash('sha1').update(`${payload.userId}|${trackIds.join(',')}`).digest('hex').slice(0, 16), ...draft, trackIds, createdAt: new Date().toISOString(), coinsCharged: coins, free }
      await updateUserSearches(payload.userId, (list) => [search, ...list.filter((s) => s.id !== search.id)])
    }
    // This user owns these tracks (a reopened search too — that fills in
    // owners for searches made before owners were recorded).
    await registerTracks(results.map((r) => r.track), payload.userId)
    send({ type: 'result', data: { ...(await searchPayload(search)), results: perJob, charged: { coins, free, reopened: !!existing } } })
  })
}
