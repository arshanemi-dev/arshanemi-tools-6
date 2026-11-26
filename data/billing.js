// Coins for viewing an entry (app/api/research/entries/[id]/unlock). The
// coin PRICE is not here: it is the `pr-search` feature's Coin Cost in the
// admin panel (Settings → Tools Catalog → Product Research → Features), read
// by the hub's /api/wallet/deduct on every charge, which also writes the
// coin history. Seed it with the hub's `npm run db:sync-product-research`.
//
// Entries are added by the master admin only; every signed-in user sees the
// list. To see an entry's data a user unlocks it, once, for good:
//  - each user's FIRST unlock is free (freeUnlocks);
//  - each one after that is charged once: 1 × pr-search (10 coins);
//  - unlocking the same entry again never charges twice (the charge's
//    idempotency key is user + entry);
//  - the master admin is never charged and sees everything.
export const PR_BILLING = {
  toolSlug: 'product-research',
  searchFeature: 'pr-search',
  freeUnlocks: 1,
  // Shown on the Unlock button only — the real price is the catalog's.
  displayCoins: 10,
};
