import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { jobOfEntry, readEntries } from '@/lib/research/entries'
import { alignEntries, readRange } from '@/lib/research/config'
import { readTrack } from '@/lib/research/store'
import { ensureJobs } from '@/lib/research/service'
import { todayIST } from '@/lib/research/time'

export const runtime = 'nodejs'
export const maxDuration = 300

// The daily snapshot. Vercel Cron (vercel.json) calls this once a day with
// "Authorization: Bearer <CRON_SECRET>"; it reads every entry whose Daily
// switch is ON and that hasn't been read today, one at a time, until ~4
// minutes are used — what's left is picked up by the next call. An entry with
// the switch OFF is never read automatically (only by the admin's Search now).
// That daily snapshot is what builds the Ranking / Review / Rating history.
const BUDGET_MS = 240_000

export async function GET(req) {
  if (!env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const started = Date.now()
  const today = todayIST()
  const autoIds = (await readEntries()).filter((e) => e.autoDaily !== false && e.kind !== 'import').map((e) => e.id)
  // Every entry is read with the shared page range (lib/research/config.js).
  const auto = autoIds.length ? await alignEntries(autoIds, await readRange()) : []
  const due = []
  for (const e of auto) if ((await readTrack(e.trackId))?.lastRunDate !== today) due.push(e)
  const done = []
  for (const e of due) {
    if (Date.now() - started > BUDGET_MS) break
    const [r] = await ensureJobs([jobOfEntry(e)])
    done.push({ name: e.name, products: Object.keys(r.track?.products || {}).length, error: r.error })
  }
  return NextResponse.json({ today, autoDaily: auto.length, due: due.length, refreshed: done.length, left: due.length - done.length, done })
}
