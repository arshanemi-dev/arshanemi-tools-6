import { NextResponse } from 'next/server'
import { adminOnly } from '@/lib/research/access'
import { saveRange } from '@/lib/research/config'

export const runtime = 'nodejs'

// PUT { fromPage, toPage } — the master admin sets the ONE page range every
// entry is read with (Search and the daily read). An entry last read with
// other pages starts a new history on its next read; going back to the old
// range brings its old history back. → { range } | 400 { error }
export async function PUT(req) {
  const { res } = await adminOnly(req)
  if (res) return res
  const out = await saveRange(await req.json().catch(() => ({})))
  if (out.error) return NextResponse.json({ error: out.error }, { status: 400 })
  return NextResponse.json(out)
}
