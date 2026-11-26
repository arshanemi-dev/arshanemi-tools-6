import { NextResponse } from 'next/server'
import { PR_BILLING } from '@/data/billing'
import { adminOnly, canSee, isAdmin, signedIn } from '@/lib/research/access'
import { editEntry, entryAsSearch, readEntries, readUnlocked, updateEntries } from '@/lib/research/entries'
import { addCategory } from '@/lib/research/config'
import { readListingUrl } from '@/data/marketplaces'
import { deleteEntries } from '@/lib/research/cleanup'
import { searchPayload } from '@/lib/research/service'

export const runtime = 'nodejs'

async function findEntry(params) {
  const { id } = await params
  return (await readEntries()).find((e) => e.id === id) || null
}

// GET → { search (the entry), tracks, status } — its products and daily
// history. Only once this user has unlocked it (the master admin always);
// otherwise 402 { locked: true, entry, coinsPerUnlock, freeLeft }.
export async function GET(req, { params }) {
  const { payload, res } = await signedIn(req)
  if (res) return res
  const entry = await findEntry(params)
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  const unlocked = isAdmin(payload) ? [] : await readUnlocked(payload.userId)
  if (!canSee(payload, entry, unlocked)) {
    const paid = process.env.NEXT_PUBLIC_IS_PAID === 'true'
    return NextResponse.json({
      locked: true,
      entry: { id: entry.id, name: entry.name, platform: entry.platform, category: entry.category },
      coinsPerUnlock: paid ? PR_BILLING.displayCoins : 0,
      freeLeft: paid ? Math.max(0, PR_BILLING.freeUnlocks - unlocked.length) : Infinity,
    }, { status: 402 })
  }
  const shown = isAdmin(payload) ? entry : { ...entry, url: undefined, autoDaily: undefined }
  return NextResponse.json(await searchPayload(entryAsSearch(shown)))
}

// PATCH — the master admin edits a row: any of { platform, category, url,
// autoDaily }. Same checks as adding (lib/research/entries.js editEntry);
// changing what it reads gives it a new name and a new history.
// → { entry, newHistory } | 400 { error } | 404
export async function PATCH(req, { params }) {
  const { res } = await adminOnly(req)
  if (res) return res
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const changes = {}
  if ('autoDaily' in body) {
    if (typeof body.autoDaily !== 'boolean') return NextResponse.json({ error: 'autoDaily must be true or false' }, { status: 400 })
    changes.autoDaily = body.autoDaily
  }
  if ('platform' in body) changes.platform = String(body.platform || '')
  if ('category' in body) changes.category = String(body.category || '')
  if ('url' in body) {
    if (String(body.url || '').trim()) {
      const read = readListingUrl(body.url)
      if (read.error) return NextResponse.json({ error: read.error }, { status: 400 })
      changes.url = read.url
    } else changes.url = null
  }
  let result = null
  await updateEntries((list) => {
    const current = list.find((e) => e.id === id)
    if (!current) return list
    result = editEntry(current, changes, list)
    return result.entry ? list.map((e) => (e.id === id ? result.entry : e)) : list
  })
  if (!result) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  if ('category' in changes) await addCategory(result.entry.category)
  return NextResponse.json(result)
}

// DELETE — the master admin deletes the entry and its saved data.
export async function DELETE(req, { params }) {
  const { res } = await adminOnly(req)
  if (res) return res
  const { id } = await params
  return NextResponse.json({ ok: true, ...(await deleteEntries([id])) })
}
