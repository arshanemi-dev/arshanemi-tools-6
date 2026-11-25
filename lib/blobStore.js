// JSON-file storage backend for lib/db.js (auth, local mode) and
// lib/research/store.js (tracked searches + daily product snapshots).
// Each tool instance gets its own namespace folder (from TOOLS_NAME):
//   database/<tools-name-slug>/<key>.json
//
// With BLOB_READ_WRITE_TOKEN set → Vercel Blob (production). Without it →
// plain files under ./.data/ (local `npm run dev`), so the tool works with
// no cloud setup at all. Same keys, same JSON either way.
import { put, head, del } from '@vercel/blob'
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

export async function deleteBlobJson(key) {
  try {
    if (!USE_BLOB) return await fs.unlink(localPath(key))
    await del(blobPath(key), { token: env.BLOB_READ_WRITE_TOKEN })
  } catch {
    // already gone
  }
}
