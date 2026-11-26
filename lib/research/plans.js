// Monthly plans — one per entry a user saved (data/billing.js). Pure (the
// server, the browser, the tests).
//
// A user's file (research/users/<id>) holds:
//   myEntries  [entryId]  saved on My Entries, in order — Entries ▾ lists these
//   plans      { [entryId]: { paidUntil, autoRenew, startedAt, months } }
// An entry's data can be seen while now < paidUntil (the master admin:
// always). autoRenew = charge the next month when this one runs out; it goes
// off when the entry is removed, or when a renewal found too few coins.

// One calendar month on (UTC), like the hub's own monthly renewals.
export function addMonth(from) {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}

export const isPaid = (plan, now = Date.now()) => !!plan?.paidUntil && Date.parse(plan.paidUntil) > now;

// 'active' (paid now) · 'expired' (was paid, the month ran out) · 'none'
export function planStatus(plan, now = Date.now()) {
  if (isPaid(plan, now)) return 'active';
  return plan?.paidUntil ? 'expired' : 'none';
}

// The saved entries whose month ran out and that renew themselves. → [id]
export function dueForRenewal(doc, now = Date.now()) {
  const plans = doc?.plans || {};
  return (doc?.myEntries || []).filter((id) => plans[id]?.autoRenew && plans[id]?.paidUntil && !isPaid(plans[id], now));
}

// Of these ids, the ones that must be paid for (not paid right now). → [id]
export const unpaid = (ids, plans, now = Date.now()) => ids.filter((id) => !isPaid(plans?.[id], now));

// A month just paid for, at `now`: the plan runs a month from now (an
// expired one starts again from today — the days it was expired aren't
// charged) and renews itself.
export function paidPlan(plan, now = Date.now()) {
  const at = new Date(now).toISOString();
  return { ...plan, startedAt: plan?.startedAt || at, paidUntil: addMonth(at), autoRenew: true, months: (plan?.months || 0) + 1 };
}
