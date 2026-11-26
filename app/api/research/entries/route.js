import { NextResponse } from 'next/server'
import { PR_BILLING } from '@/data/billing'
import { readListingUrl } from '@/data/marketplaces'
import { adminOnly, isAdmin, signedIn } from '@/lib/research/access'
import { makeEntry, readEntries, readUserLists, updateEntries } from '@/lib/research/entries'
import { entryStats, storageSummary } from '@/lib/research/cleanup'
import { addCategory, readCategories, readRange } from '@/lib/research/config'

export const runtime = 'nodejs'

// GET → every entry, for any signed-in user:
//   { entries: [{ id, name, platform, category, kind, fromPage, toPage,
//     locked }], isAdmin, freeLeft, coinsPerUnlock, myEntries }
// myEntries = the ids of the entries this user saved on My Entries (still
// existing ones) — Product Research's Entries ▾ lists only these.
// The master admin also gets each entry's link, daily switch and stats
// (products, days, lastRead, lastError), the storage summary, the shared
// page range and the category list.
export async function GET(req) {
  const { payload, res } = await signedIn(req)
  if (res) return res
  const entries = await readEntries()
  const ids = new Set(entries.map((e) => e.id))
  const { unlocked, myEntries: saved } = await readUserLists(payload.userId)
  const myEntries = saved.filter((id) => ids.has(id))
  if (isAdmin(payload)) {
    const [withStats, storage, range, categories] = await Promise.all([entryStats(entries), storageSummary(), readRange(), readCategories()])
    return NextResponse.json({ entries: withStats.map((e) => ({ ...e, locked: false })), isAdmin: true, freeLeft: Infinity, coinsPerUnlock: 0, storage, range, categories, myEntries })
  }
  const paid = process.env.NEXT_PUBLIC_IS_PAID === 'true'
  return NextResponse.json({
    entries: entries.map(({ id, name, platform, category, kind, fromPage, toPage, createdAt }) => ({ id, name, platform, category, kind, fromPage, toPage, createdAt, locked: !unlocked.includes(id) })),
    myEntries,
    isAdmin: false,
    freeLeft: paid ? Math.max(0, PR_BILLING.freeUnlocks - unlocked.length) : Infinity,
    coinsPerUnlock: paid ? PR_BILLING.displayCoins : 0,
  })
}

// POST { platform, category, url?, autoDaily } — the master admin adds an
// entry (a new row): name = "<marketplace>_<category>" (unique); `url` = the
// one category / search page to read (empty = the marketplace's own search
// for the category); pages = the shared range. Not read yet — Search reads
// it. Its category joins the category list.
// → 201 { entry } | 400 { error }
export async function POST(req) {
  const { res } = await adminOnly(req)
  if (res) return res
  const body = await req.json().catch(() => ({}))
  let url = null
  if (String(body.url || '').trim()) {
    const read = readListingUrl(body.url)
    if (read.error) return NextResponse.json({ error: read.error }, { status: 400 })
    url = read.url
  }
  const range = await readRange()
  let made
  await updateEntries((list) => {
    made = makeEntry({ ...body, url }, list, range)
    return made.entry ? [made.entry, ...list] : list
  })
  if (made.error) return NextResponse.json({ error: made.error }, { status: 400 })
  await addCategory(made.entry.category)
  return NextResponse.json({ entry: made.entry }, { status: 201 })
}
