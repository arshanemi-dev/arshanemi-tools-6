import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addMonth, dueForRenewal, isPaid, paidPlan, planStatus, unpaid } from '../lib/research/plans.js';

// Monthly entry plans, end to end, against a fake hub wallet: the hub's
// /api/wallet/deduct is answered here (5000 coins per entry-month, its
// idempotency keys honoured), so the real charging code runs.
process.chdir(mkdtempSync(path.join(tmpdir(), 'pr-billing-')));
process.env.JWT_SECRET = 'test-secret';
process.env.TOOLS_NAME = 'billing-test';
process.env.NEXT_PUBLIC_IS_PAID = 'true';
process.env.NEXT_PUBLIC_ADMIN_API_URL = 'http://hub.test';
delete process.env.BLOB_READ_WRITE_TOKEN;

const PRICE = 5000;
const hub = { coins: 0, keys: new Map(), calls: [] };
globalThis.fetch = async (url, init = {}) => {
  assert.equal(url, 'http://hub.test/api/wallet/deduct');
  const body = JSON.parse(init.body);
  hub.calls.push(body);
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  assert.equal(body.featureApiIdentifier, 'pr-entry-month');
  if (hub.keys.has(body.idempotencyKey)) return json(200, { ok: true, duplicate: true, coinsCost: hub.keys.get(body.idempotencyKey), remainingCoins: hub.coins });
  const amount = PRICE * body.quantity;
  if (hub.coins < amount) return json(402, { error: 'insufficient_coins', remainingCoins: hub.coins, requiredCoins: amount });
  hub.coins -= amount;
  hub.keys.set(body.idempotencyKey, amount);
  return json(200, { ok: true, coinsCost: amount, remainingCoins: hub.coins });
};

const subs = await import('../lib/research/subscriptions.js');
const entries = await import('../lib/research/entries.js');

const req = { headers: new Headers({ Authorization: 'Bearer user-token' }), cookies: { get: () => undefined } };
const user = { userId: 'u1', role: 'user' };
const ALL = ['a', 'b', 'c'];
const DAY = 24 * 3600 * 1000;

test('plan maths: a month on, paid / expired / none, what is due', () => {
  assert.equal(addMonth('2026-11-26T10:00:00.000Z'), '2026-12-26T10:00:00.000Z');
  const now = Date.parse('2026-11-26T10:00:00.000Z');
  assert.equal(planStatus(undefined, now), 'none');
  assert.equal(planStatus({ paidUntil: '2026-12-01T00:00:00.000Z' }, now), 'active');
  assert.equal(planStatus({ paidUntil: '2026-11-01T00:00:00.000Z' }, now), 'expired');
  const doc = {
    myEntries: ['a', 'b', 'c'],
    plans: { a: { paidUntil: '2026-11-01T00:00:00.000Z', autoRenew: true }, b: { paidUntil: '2026-11-01T00:00:00.000Z', autoRenew: false }, c: { paidUntil: '2026-12-01T00:00:00.000Z', autoRenew: true }, d: { paidUntil: '2026-11-01T00:00:00.000Z', autoRenew: true } },
  };
  assert.deepEqual(dueForRenewal(doc, now), ['a']); // b doesn't renew, c is paid, d isn't on the list
  assert.deepEqual(unpaid(['a', 'c', 'x'], doc.plans, now), ['a', 'x']);
  const p = paidPlan(doc.plans.a, now);
  assert.equal(p.paidUntil, '2026-12-26T10:00:00.000Z'); // an expired one starts again from today
  assert.equal(p.autoRenew, true);
  assert.ok(isPaid(p, now));
});

test('adding with too few coins: refused, nothing saved', async () => {
  hub.coins = 4000;
  const out = await subs.addEntries(req, user, ['a'], { requestId: 'click-1', existing: ALL });
  assert.equal(out.blocked.reason, 'insufficient_coins');
  assert.equal(out.blocked.data.requiredCoins, 5000);
  assert.match(out.blocked.data.note, /Nothing was added/);
  assert.deepEqual((await entries.readUserDoc('u1')).myEntries, []);
});

test('adding two entries: 10,000 coins in one charge, a month each, renewing', async () => {
  hub.coins = 12000;
  const out = await subs.addEntries(req, user, ['a', 'b', 'gone'], { requestId: 'click-2', existing: ALL });
  assert.deepEqual(out.added, ['a', 'b']);
  assert.equal(out.charged.coins, 10000);
  assert.equal(out.charged.remainingCoins, 2000);
  assert.equal(hub.calls.at(-1).quantity, 2);
  const doc = await entries.readUserDoc('u1');
  assert.deepEqual(doc.myEntries, ['a', 'b']);
  assert.ok(isPaid(doc.plans.a) && doc.plans.a.autoRenew);
  // The same click sent again (a retry) isn't charged again.
  const again = await subs.addEntries(req, user, ['a', 'b'], { requestId: 'click-2', existing: ALL });
  assert.equal(again.charged.coins, 0); // both are paid now — nothing to charge at all
  assert.equal(hub.coins, 2000);
});

test('a reused click id with OTHER entries is charged — the key covers the entries', async () => {
  hub.coins = 5000;
  const out = await subs.addEntries(req, user, ['c'], { requestId: 'click-2', existing: ALL });
  assert.equal(out.charged.coins, 5000);
  assert.equal(hub.coins, 0);
});

test('remove: no more renewals; adding it back inside the paid month is free', async () => {
  const out = await subs.removeEntries('u1', ['c']);
  assert.deepEqual(out.removed, ['c']);
  let doc = await entries.readUserDoc('u1');
  assert.equal(doc.plans.c.autoRenew, false);
  assert.ok(isPaid(doc.plans.c)); // still viewable till the month ends
  const back = await subs.addEntries(req, user, ['c'], { requestId: 'click-3', existing: ALL });
  assert.equal(back.charged.coins, 0);
  doc = await entries.readUserDoc('u1');
  assert.equal(doc.plans.c.autoRenew, true);
  assert.deepEqual(doc.myEntries, ['a', 'b', 'c']);
});

// Move the user's months into the past, as if they had run out.
async function expire(ids, daysAgo = 1) {
  await entries.updateUserDoc('u1', async (doc) => {
    const plans = { ...doc.plans };
    for (const id of ids) plans[id] = { ...plans[id], paidUntil: new Date(Date.now() - daysAgo * DAY).toISOString() };
    return { doc: { ...doc, plans }, result: null };
  });
}

test('monthly renewal: each entry that ran out is charged a month, once', async () => {
  await expire(['a', 'b']);
  hub.coins = 10000;
  const out = await subs.renewEntries(req, user);
  assert.deepEqual(out.renewed.map((r) => r.id), ['a', 'b']);
  assert.equal(out.coins, 10000);
  assert.equal(out.blocked, null);
  const doc = await entries.readUserDoc('u1');
  assert.ok(isPaid(doc.plans.a) && isPaid(doc.plans.b));
  // Nothing is due any more → nothing charged.
  const none = await subs.renewEntries(req, user);
  assert.deepEqual(none.renewed, []);
  assert.equal(hub.coins, 0);
});

test('monthly renewal with too few coins: renews what it can, the rest turn Expired (never into debt)', async () => {
  await expire(['a', 'b', 'c']);
  hub.coins = 5000;
  const out = await subs.renewEntries(req, user);
  assert.deepEqual(out.renewed.map((r) => r.id), ['a']);
  assert.deepEqual(out.lapsed, ['b', 'c']);
  assert.equal(out.blocked.reason, 'insufficient_coins');
  assert.equal(hub.coins, 0);
  const doc = await entries.readUserDoc('u1');
  assert.equal(planStatus(doc.plans.b), 'expired');
  assert.equal(doc.plans.b.autoRenew, false);
  assert.deepEqual(dueForRenewal(doc), []); // not retried every visit
  assert.deepEqual(doc.myEntries, ['a', 'b', 'c']); // still on the list, as Expired
});

test('Renew by hand after topping up: a month again, renewing again', async () => {
  hub.coins = 5000;
  const out = await subs.renewEntries(req, user, ['b', 'a']); // a is paid — skipped
  assert.deepEqual(out.renewed.map((r) => r.id), ['b']);
  assert.equal(out.coins, 5000);
  const doc = await entries.readUserDoc('u1');
  assert.ok(isPaid(doc.plans.b) && doc.plans.b.autoRenew);
  // Too few coins by hand: refused, nothing changes (it stays Expired).
  const no = await subs.renewEntries(req, user, ['c']);
  assert.equal(no.blocked.reason, 'insufficient_coins');
  assert.deepEqual(no.lapsed, []);
  assert.equal(planStatus((await entries.readUserDoc('u1')).plans.c), 'expired');
});

test('the master admin is never charged and needs no plan', async () => {
  const calls = hub.calls.length;
  const admin = { userId: 'boss', role: 'master_admin' };
  const out = await subs.addEntries(req, admin, ['a', 'b'], { requestId: 'x', existing: ALL });
  assert.equal(out.charged.coins, 0);
  assert.deepEqual(out.myEntries, ['a', 'b']);
  assert.deepEqual((await subs.renewEntries(req, admin)).renewed, []);
  assert.equal(hub.calls.length, calls);
});

test('the hub not answering: nothing saved, a plain message', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  try {
    const out = await subs.addEntries(req, { userId: 'u2', role: 'user' }, ['a'], { requestId: 'y', existing: ALL });
    assert.match(out.error, /couldn’t be checked/);
    assert.deepEqual((await entries.readUserDoc('u2')).myEntries, []);
  } finally {
    globalThis.fetch = real;
  }
});
