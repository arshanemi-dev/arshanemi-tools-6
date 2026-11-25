import { NextResponse } from 'next/server'
import { getAuthPayload } from '@/lib/auth'
import { tooManyAttempts, MINUTES } from '@/lib/rateLimit'
import { readUserSearches } from '@/lib/research/store'
import { ensureFresh, planOf, searchPayload } from '@/lib/research/service'
import { ndjson } from '@/lib/research/stream'

export const runtime = 'nodejs'
export const maxDuration = 300

// POST → today's snapshot for a search the user already has. Always free.
// A marketplace / link already read today is not read again (once a day is
// the tracking grain); the daily cron does this on its own too — this is for
// "I want today's numbers now", and for opening a search that wasn't read yet.
// Answers as a live stream like POST /api/research/search: plan, progress per
// track, then { type: 'result', data: { search, tracks, status, refreshed } }.
export async function POST(req, { params }) {
  const payload = await getAuthPayload(req)
  if (!payload?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limited = tooManyAttempts(req, 'research-refresh', { limit: 30, windowMs: 10 * MINUTES, subject: payload.userId, subjectLimit: 15 })
  if (limited) return limited

  const { id } = await params
  const search = (await readUserSearches(payload.userId)).find((s) => s.id === id)
  if (!search) return NextResponse.json({ error: 'Search not found' }, { status: 404 })
  if (search.kind === 'import') return NextResponse.json({ error: 'An imported sheet is updated by importing it again' }, { status: 400 })

  return ndjson(async (send) => {
    send({ type: 'plan', kind: search.kind || 'search', label: search.query, jobs: planOf(search) })
    const results = await ensureFresh(search, { onProgress: (p) => send({ type: 'progress', ...p }) })
    send({
      type: 'result',
      data: {
        ...(await searchPayload(search)),
        refreshed: results.map((r) => ({ id: r.id, platform: r.platform, label: r.label, fresh: r.fresh, error: r.error, blocked: r.blocked })),
      },
    })
  })
}
