// Monthly entry plans — adding, removing and renewing, with the coin charge.
// Server-only. The rules are data/billing.js; the plan maths is plans.js.
//
// Every charge goes through the hub's /api/wallet/deduct (lib/serverBilling.js)
// with the user's own token, as 1 × pr-entry-month per entry, and is never
// made twice for the same thing:
//   adding     one deduct for the whole click (quantity = entries not paid
//              yet), key = user + the click's id + those entries — a retry of
//              the same click is free, a different set of entries isn't;
//   renewing   one deduct per entry, key = user + entry + the month that ran
//              out — two tabs renewing at once pay once.
// Nothing is saved unless its charge went through. The master admin is never
// charged (their entries need no plan at all).

import { createHash } from 'node:crypto';
import { PR_BILLING } from '@/data/billing';
import { runServerBillingGate } from '@/lib/serverBilling';
import { isAdmin } from './roles';
import { updateUserDoc } from './entries';
import { dueForRenewal, isPaid, paidPlan, unpaid } from './plans';

const COIN_REASONS = ['insufficient_coins', 'coins_expired'];
const HUB_DOWN = 'Your coins couldn’t be checked right now — try again in a moment.';

// → { ok: true, coins, remainingCoins } | { ok: false, reason, data }
async function charge(req, quantity, idempotencyKey) {
  const gate = await runServerBillingGate(req, {
    toolSlug: PR_BILLING.toolSlug, featureApiIdentifier: PR_BILLING.monthFeature, quantity, idempotencyKey,
  });
  if (gate.status !== 'proceed') return { ok: false, reason: gate.reason, data: gate.data };
  return { ok: true, coins: gate.data?.duplicate ? 0 : gate.data?.coinsCost || 0, remainingCoins: gate.data?.remainingCoins ?? null };
}

const keyHash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);

// Save entries to the user's list — the ones not paid for right now are
// charged a month each (all in one charge, all or nothing); the ones still
// inside a paid month come back free and renew again. `existing` = ids of the
// entries there are now; `requestId` = the click's id (a retry sends the same).
// → { myEntries, added: [id], charged: { coins, entries: [id], remainingCoins } }
//   | { blocked: { reason, data } } (nothing saved) | { error } (hub down)
export async function addEntries(req, payload, ids, { requestId = '', existing = [] } = {}) {
  const there = new Set(existing);
  const wanted = [...new Set(ids)].filter((id) => there.has(id));
  const admin = isAdmin(payload);
  return updateUserDoc(payload.userId, async (doc) => {
    const now = Date.now();
    const plans = { ...doc.plans };
    const pay = admin ? [] : unpaid(wanted, plans, now);
    let charged = { coins: 0, entries: [], remainingCoins: null };
    if (pay.length) {
      let got;
      try {
        got = await charge(req, pay.length, `pr-add:${payload.userId}:${keyHash(`${requestId}|${[...pay].sort().join(',')}`)}`);
      } catch (err) {
        console.error('product-research add charge failed:', err);
        return { doc: null, result: { error: HUB_DOWN } };
      }
      if (!got.ok) return { doc: null, result: { blocked: { reason: got.reason, data: { ...got.data, note: 'Nothing was added. Add coins and try again — you won’t be charged twice for the same entries.' } } } };
      for (const id of pay) plans[id] = paidPlan(plans[id], now);
      charged = { coins: got.coins, entries: pay, remainingCoins: got.remainingCoins };
    }
    // Back inside a month already paid: renews again from now on.
    for (const id of wanted) if (!pay.includes(id) && plans[id]) plans[id] = { ...plans[id], autoRenew: true };
    const added = wanted.filter((id) => !doc.myEntries.includes(id));
    const myEntries = [...doc.myEntries.filter((id) => there.has(id)), ...added];
    return { doc: { ...doc, myEntries, plans }, result: { myEntries, added, charged } };
  });
}

// Take entries off the list: they stop renewing. The month already paid
// isn't refunded — the entry stays viewable until it ends, and adding it back
// inside it costs nothing. → { myEntries, removed: [id] }
export async function removeEntries(userId, ids) {
  const drop = new Set(ids);
  return updateUserDoc(userId, async (doc) => {
    const plans = { ...doc.plans };
    for (const id of drop) if (plans[id]) plans[id] = { ...plans[id], autoRenew: false };
    const myEntries = doc.myEntries.filter((id) => !drop.has(id));
    return { doc: { ...doc, myEntries, plans }, result: { myEntries, removed: doc.myEntries.filter((id) => drop.has(id)) } };
  });
}

// Renew entries whose month ran out, a month each, one charge per entry:
//   ids = null → the saved ones that renew themselves (the monthly renewal,
//                run on the user's first visit after a month ends). Too few
//                coins → that entry and the rest turn Expired (renewal off —
//                never into debt); the hub unreachable → left as they are,
//                tried again on the next visit.
//   ids        → these, by hand (Renew on an Expired one): they go back on
//                the list and renew themselves again.
// → { renewed: [{ id, paidUntil }], lapsed: [id], coins, remainingCoins,
//     blocked: { reason, data } | null, error: string | null }
export async function renewEntries(req, payload, ids = null) {
  const none = { renewed: [], lapsed: [], coins: 0, remainingCoins: null, blocked: null, error: null };
  if (isAdmin(payload)) return none;
  return updateUserDoc(payload.userId, async (doc) => {
    const now = Date.now();
    const plans = { ...doc.plans };
    const targets = ids
      ? [...new Set(ids)].filter((id) => plans[id]?.paidUntil && !isPaid(plans[id], now))
      : dueForRenewal(doc, now);
    if (!targets.length) return { doc: null, result: none };
    const out = { ...none, renewed: [], lapsed: [] };
    for (let i = 0; i < targets.length; i += 1) {
      const id = targets[i];
      let got;
      try {
        got = await charge(req, 1, `pr-renew:${payload.userId}:${id}:${plans[id].paidUntil}`);
      } catch (err) {
        console.error('product-research renewal charge failed:', err);
        out.error = HUB_DOWN;
        break;
      }
      if (!got.ok) {
        out.blocked = { reason: got.reason, data: got.data };
        if (!ids && COIN_REASONS.includes(got.reason)) {
          for (const left of targets.slice(i)) { plans[left] = { ...plans[left], autoRenew: false }; out.lapsed.push(left); }
        }
        break;
      }
      plans[id] = paidPlan(plans[id], now);
      out.renewed.push({ id, paidUntil: plans[id].paidUntil });
      out.coins += got.coins;
      if (got.remainingCoins != null) out.remainingCoins = got.remainingCoins;
    }
    const myEntries = ids ? [...doc.myEntries, ...out.renewed.map((r) => r.id).filter((id) => !doc.myEntries.includes(id))] : doc.myEntries;
    const changed = out.renewed.length || out.lapsed.length;
    return { doc: changed ? { ...doc, myEntries, plans } : null, result: out };
  });
}
