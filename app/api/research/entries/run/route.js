import { NextResponse } from 'next/server'
import { adminOnly } from '@/lib/research/access'
import { jobOfEntry, readEntries } from '@/lib/research/entries'
import { ensureJobs } from '@/lib/research/service'
import { ndjson } from '@/lib/research/stream'

export const runtime = 'nodejs'
export const maxDuration = 300

// POST { ids: [entryId, …] } — the master admin's Search: read these
// entries right now — each from page 1 on until it has its Products to Read
// — again even if already read today (today's snapshot is replaced).
// Live stream (lib/research/stream.js):
// { type: 'plan', jobs } · { type: 'progress', … } per entry · then
// { type: 'result', data: { results: [{ id, name, products, error }] } }.
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

  return ndjson(async (send) => {
    const jobs = entries.map(jobOfEntry)
    send({ type: 'plan', kind: 'search', label: entries.length === 1 ? entries[0].name : `${entries.length} entries`, jobs: jobs.map(({ id, platform, label }) => ({ id, platform, label })) })
    const results = await ensureJobs(jobs, { force: true, onProgress: (p) => send({ type: 'progress', ...p }) })
    send({
      type: 'result',
      data: { results: results.map((r) => ({ id: entries.find((e) => e.trackId === r.id)?.id, name: r.label, platform: r.platform, products: r.track?.runs?.[0]?.count ?? 0, error: r.error, blocked: r.blocked })) },
    })
  })
}
