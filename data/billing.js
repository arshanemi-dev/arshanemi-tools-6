// Coins for Product Research — a monthly plan per entry. Nothing is free
// (only the master admin is never charged, as everywhere in the hub).
//
// The coin PRICE is not here: it is the `pr-entry-month` feature's Coin Cost
// in the admin panel (Settings → Tools Catalog → Product Research →
// Features), read by the hub's /api/wallet/deduct on every charge, which also
// writes the coin history. Seed it with the hub's
// `npm run db:sync-product-research` (5000 coins).
//
//  - A user saves an entry on My Entries → 1 × pr-entry-month is charged and
//    buys one month of that entry (its data on Product Research).
//  - Each month it renews itself: the first visit after the month ends
//    charges the next month (lib/research/plans.js). The wallet can't cover
//    it → the entry turns Expired (never into debt) until the user renews it.
//  - Removing an entry stops its renewals; the month already paid isn't
//    refunded — and adding it back inside that month costs nothing.
//  - A charge is never made twice for the same thing (idempotency keys: one
//    per Add click, one per entry per month renewed).
export const PR_BILLING = {
  toolSlug: 'product-research',
  monthFeature: 'pr-entry-month',
  // Shown only when the live catalog price can't be read — the real price
  // is the catalog's (lib/research/price.js).
  displayCoins: 5000,
};
