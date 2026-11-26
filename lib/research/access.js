// Who may do what in Product Research. Server-only — every route asks here,
// so a page hidden in the browser is never the only guard.
import { NextResponse } from 'next/server';
import { getAuthPayload } from '@/lib/auth';

export const isAdmin = (payload) => payload?.role === 'master_admin';

// → { payload } for a signed-in user, else { res } (401) to return as is.
export async function signedIn(req) {
  const payload = await getAuthPayload(req);
  if (!payload?.userId) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  return { payload };
}

// → { payload } for the master admin, else { res } (401 / 403).
export async function adminOnly(req) {
  const { payload, res } = await signedIn(req);
  if (res) return { res };
  if (!isAdmin(payload)) return { res: NextResponse.json({ error: 'Only the master admin can do this' }, { status: 403 }) };
  return { payload };
}

// Can this user see this entry's data? The master admin always; others once unlocked.
export const canSee = (payload, entry, unlocked) => isAdmin(payload) || unlocked.includes(entry.id);
