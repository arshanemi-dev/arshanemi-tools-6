import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { readIndex } from '@/lib/research/store'
import { ensureFresh } from '@/lib/research/service'
import { todayIST } from '@/lib/research/time'

export const runtime = 'nodejs'
export const maxDuration = 300

// The daily snapshot. Vercel Cron (vercel.json) calls this once a day with
// "Authorization: Bearer <CRON_SECRET>"; it reads every tracked keyword that
// hasn't been read today, one at a time, until ~4 minutes are used — what's
// left is picked up by the next call (or when a user opens that search).
// That daily snapshot is what builds the Ranking / Review / Rating history.
const BUDGET_MS = 240_000

export async function GET(req) {
  if (!env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const started = Date.now()
  const today = todayIST()
  const due = (await readIndex()).filter((e) => e.lastRunDate !== today)
  const done = []
  for (const e of due) {
    if (Date.now() - started > BUDGET_MS) break
    // An index entry is one track: a keyword on one marketplace, or one link.
    const one = e.url
      ? { kind: 'url', urls: [e.url], fromPage: e.fromPage, toPage: e.toPage, pages: e.pages }
      : { kind: 'search', query: e.query, platforms: [e.platform], fromPage: e.fromPage, toPage: e.toPage, pages: e.pages }
    const [r] = await ensureFresh(one)
    done.push({ id: e.id, products: Object.keys(r.track?.products || {}).length, error: r.error })
  }
  return NextResponse.json({ today, due: due.length, refreshed: done.length, left: due.length - done.length, done })
}
