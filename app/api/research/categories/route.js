import { NextResponse } from 'next/server'
import { adminOnly } from '@/lib/research/access'
import { addCategory } from '@/lib/research/config'

export const runtime = 'nodejs'

// POST { name } — the master admin adds a category to the list (typed into
// the Category dropdown + Enter). One that already exists in any letter case
// is reused. → { category, categories } | 400 { error }
export async function POST(req) {
  const { res } = await adminOnly(req)
  if (res) return res
  const body = await req.json().catch(() => ({}))
  const out = await addCategory(body.name)
  if (out.error) return NextResponse.json({ error: out.error }, { status: 400 })
  return NextResponse.json(out)
}
