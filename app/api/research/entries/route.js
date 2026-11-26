import { NextResponse } from 'next/server'
import { readListingUrl } from '@/data/marketplaces'
import { adminOnly, isAdmin, signedIn } from '@/lib/research/access'
import { makeEntry, readEntries, readUserDoc, updateEntries } from '@/lib/research/entries'
import { entryStats, storageSummary } from '@/lib/research/cleanup'
import { addCategory, readCategories, readRange } from '@/lib/research/config'
import { dueForRenewal, planStatus } from '@/lib/research/plans'
import { coinsPerMonth } from '@/lib/research/price'

export const runtime = 'nodejs'

// GET → every entry, for any signed-in user (login is required):
//   { entries: [{ id, name, platform, category, kind, fromPage, toPage,
//     saved, status, paidUntil, autoRenew, locked }], myEntries, due,
//     coinsPerMonth, isAdmin }
//   saved     on this user's My Entries list (myEntries = those ids, in order)
//   status    'active' (its month is paid) · 'expired' · 'none' (never paid)
//   locked    its data can't be seen now (status isn't active)
//   due       saved entries whose month ran out and that renew themselves —
//             the page renews them (POST /api/research/my-entries/renew)
//   coinsPerMonth  the live price of one entry for one month (0 = free)
// A read never charges. The master admin sees every entry unlocked, free,
// and also gets each entry's link, daily switch and stats (products, days,
// lastRead, lastError), the storage summary, the shared page range and the
// category list.
export async function GET(req) {
  const { payload, res } = await signedIn(req)
  if (res) return res
  const entries = await readEntries()
  const ids = new Set(entries.map((e) => e.id))
  const doc = await readUserDoc(payload.userId)
  const myEntries = doc.myEntries.filter((id) => ids.has(id))
  const now = Date.now()
  if (isAdmin(payload)) {
    const [withStats, storage, range, categories] = await Promise.all([entryStats(entries), storageSummary(), readRange(), readCategories()])
    return NextResponse.json({
      entries: withStats.map((e) => ({ ...e, saved: myEntries.includes(e.id), status: 'active', paidUntil: null, autoRenew: false, locked: false })),
      myEntries, due: [], coinsPerMonth: 0, isAdmin: true, storage, range, categories,
    })
  }
  return NextResponse.json({
    entries: entries.map(({ id, name, platform, category, kind, fromPage, toPage, createdAt }) => {
      const plan = doc.plans[id]
      const status = planStatus(plan, now)
      return { id, name, platform, category, kind, fromPage, toPage, createdAt, saved: myEntries.includes(id), status, paidUntil: plan?.paidUntil || null, autoRenew: !!plan?.autoRenew, locked: status !== 'active' }
    }),
    myEntries,
    due: dueForRenewal({ ...doc, myEntries }, now),
    coinsPerMonth: await coinsPerMonth(req),
    isAdmin: false,
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
