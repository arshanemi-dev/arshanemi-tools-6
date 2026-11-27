import { NextResponse, after } from 'next/server'
import { adminOnly } from '@/lib/research/access'
import { readEntries } from '@/lib/research/entries'
import { readRun, runInBackground, startRun } from '@/lib/research/backgroundRun'

export const runtime = 'nodejs'
// The reading goes on after the answer (after()), for up to this long.
export const maxDuration = 300

// The master admin's Search, run in the background (lib/research/
// backgroundRun.js):
//   POST { ids: [entryId, …] } → 202 { run } at once — each entry is then
//        read from page 1 on until it has its Products to Read (again even
//        if already read today: today's snapshot is replaced), and the run's
//        progress is saved as it goes. 409 { error, run } while another
//        Search is still running.
//   GET  → { run } — the latest run (null = none yet), for the page to show
//        and to ask again every few seconds while it runs.
const MAX_AT_ONCE = 20

export async function POST(req) {
  const { res } = await adminOnly(req)
  if (res) return res
  const body = await req.json().catch(() => ({}))
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x) => typeof x === 'string')
  if (!ids.length) return NextResponse.json({ error: 'Tick at least one entry to search' }, { status: 400 })
  if (ids.length > MAX_AT_ONCE) return NextResponse.json({ error: `At most ${MAX_AT_ONCE} entries at once` }, { status: 400 })
  const entries = (await readEntries()).filter((e) => ids.includes(e.id) && e.kind !== 'import')
  if (!entries.length) return NextResponse.json({ error: 'Nothing to search — imported sheets are updated by importing them again' }, { status: 400 })

  const { run, busy } = await startRun(entries)
  if (busy) return NextResponse.json({ error: 'A Search is still running — wait for it to finish, then search again.', run }, { status: 409 })
  after(() => runInBackground(run, entries))
  return NextResponse.json({ run }, { status: 202 })
}

export async function GET(req) {
  const { res } = await adminOnly(req)
  if (res) return res
  return NextResponse.json({ run: await readRun() })
}
