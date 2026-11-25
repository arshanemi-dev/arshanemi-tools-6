// Coins for a search (app/api/research/search/route.js). The coin PRICE is
// not here: it is the `pr-search` feature's Coin Cost in the admin panel
// (Settings → Tools Catalog → Product Research → Features), read by the
// hub's /api/wallet/deduct on every charge, which also writes the coin
// history. Seed it with the hub's `npm run db:sync-product-research`.
//
// A "search" = one keyword / category across the marketplaces picked with it.
//  - Every signed-in user's FIRST search is free (freeSearches).
//  - Each search after that is charged once: 1 × pr-search (10 coins).
//  - Re-opening, refreshing, the daily auto-refresh and exports of a search
//    you already have are always free — tracking is the point.
//  - Searching a keyword you already track opens it; it is never charged twice
//    (the charge's idempotency key is user + keyword + marketplaces).
export const PR_BILLING = {
  toolSlug: 'product-research',
  searchFeature: 'pr-search',
  freeSearches: 1,
  // Shown on the Search button only — the real price is the catalog's.
  displayCoins: 10,
};
