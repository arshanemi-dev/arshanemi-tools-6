// JSON-file storage backend for lib/db.js (auth, local mode) and
// lib/research/store.js (tracked searches + daily product snapshots).
// Each tool instance gets its own namespace folder (from TOOLS_NAME):
//   database/<tools-name-slug>/<key>.json
//
// With BLOB_READ_WRITE_TOKEN set → Vercel Blob (production). Without it →
// plain files under ./.data/ (local `npm run dev`), so the tool works with
// no cloud setup at all. Same keys, same JSON either way.
import { put, head, del, list } from '@vercel/blob'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { env } from '@/lib/env'

const TOOLS_NAME = env.TOOLS_NAME
const USE_BLOB = !!env.BLOB_READ_WRITE_TOKEN
const LOCAL_ROOT = path.join(process.cwd(), '.data')

function toSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'barmeto-tools-dashboard'
}

function blobPath(key) {
  return `database/${toSlug(TOOLS_NAME)}/${key}.json`
}

const localPath = (key) => path.join(LOCAL_ROOT, blobPath(key))

// Resolves the blob's real URL via head() (authenticated by
// BLOB_READ_WRITE_TOKEN) instead of hand-building it — head() throws when the
// blob doesn't exist, which the catch turns into `fallback`.
export async function readBlobJson(key, fallback) {
  try {
    if (!USE_BLOB) return JSON.parse(await fs.readFile(localPath(key), 'utf8'))
    const meta = await head(blobPath(key), { token: env.BLOB_READ_WRITE_TOKEN })
    const res = await fetch(`${meta.url}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return fallback
    return await res.json()
  } catch {
    return fallback
  }
}

export async function writeBlobJson(key, data) {
  const body = JSON.stringify(data)
  if (!USE_BLOB) {
    const file = localPath(key)
    await fs.mkdir(path.dirname(file), { recursive: true })
    // Write-then-rename: a crash mid-write never leaves half a JSON file.
    await fs.writeFile(`${file}.tmp`, body)
    await fs.rename(`${file}.tmp`, file)
    return data
  }
  await put(blobPath(key), body, {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: env.BLOB_READ_WRITE_TOKEN,
  })
  return data
}

// Every stored key under `prefix` (e.g. 'research/tracks/') → [{ key, size }]
// with `key` as the other functions take it (no namespace, no .json).
export async function listBlobJson(prefix) {
  const base = blobPath('').replace(/\.json$/, '')
  if (!USE_BLOB) {
    const out = []
    const walk = async (dir) => {
      let entries = []
      try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) await walk(full)
        else if (e.name.endsWith('.json')) {
          const rel = path.relative(path.join(LOCAL_ROOT, base), full).split(path.sep).join('/')
          out.push({ key: rel.replace(/\.json$/, ''), size: (await fs.stat(full)).size })
        }
      }
    }
    await walk(path.join(LOCAL_ROOT, base, prefix))
    return out.filter((b) => b.key.startsWith(prefix))
  }
  const out = []
  let cursor
  let hasMore = true
  while (hasMore) {
    const page = await list({ prefix: `${base}${prefix}`, cursor, limit: 1000, token: env.BLOB_READ_WRITE_TOKEN })
    for (const b of page.blobs) out.push({ key: b.pathname.slice(base.length).replace(/\.json$/, ''), size: b.size })
    cursor = page.cursor
    hasMore = page.hasMore
  }
  return out
}

// Many keys at once (Blob: one request per 100).
export async function deleteBlobJsonMany(keys) {
  if (!keys.length) return
  if (!USE_BLOB) {
    await Promise.all(keys.map((k) => fs.unlink(localPath(k)).catch(() => {})))
    return
  }
  for (let i = 0; i < keys.length; i += 100) {
    await del(keys.slice(i, i + 100).map(blobPath), { token: env.BLOB_READ_WRITE_TOKEN })
  }
}

export async function deleteBlobJson(key) {
  try {
    if (!USE_BLOB) return await fs.unlink(localPath(key))
    await del(blobPath(key), { token: env.BLOB_READ_WRITE_TOKEN })
  } catch {
    // already gone
  }
}
