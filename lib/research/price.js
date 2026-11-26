// The live price of one entry-month — the `pr-entry-month` feature's Coin
// Cost in the hub's Tools Catalog (data/billing.js), so the confirm windows
// show what /api/wallet/deduct will really charge. Server-only.
//
// Read through the hub's GET /api/tools/my with the user's own token (it
// lists the tools that user may use, with their features), kept for 5
// minutes (it's the same for everyone). The hub slow or the feature not
// there → PR_BILLING.displayCoins, not cached. Billing off
// (NEXT_PUBLIC_IS_PAID ≠ 'true') → 0: nothing is charged.

import { PR_BILLING } from '@/data/billing';
import { authHeaderFrom, proxyAdminCall } from '@/lib/connect';

const KEEP_MS = 5 * 60_000;
const cache = (globalThis.__prMonthPrice ??= { at: 0, coins: null });

export async function coinsPerMonth(req) {
  if (process.env.NEXT_PUBLIC_IS_PAID !== 'true') return 0;
  if (cache.coins != null && Date.now() - cache.at < KEEP_MS) return cache.coins;
  try {
    const { status, data } = await proxyAdminCall('/api/tools/my', { authHeader: authHeaderFrom(req), signal: AbortSignal.timeout(4000) });
    const tool = status === 200 && Array.isArray(data) ? data.find((t) => t.slug === PR_BILLING.toolSlug) : null;
    const feature = tool?.features?.find((f) => f.apiIdentifier === PR_BILLING.monthFeature);
    if (feature) {
      cache.coins = feature.isActive ? Math.ceil(Number(feature.coinCost) || 0) : 0;
      cache.at = Date.now();
      return cache.coins;
    }
  } catch {
    // the hub didn't answer in time — the shown price falls back below
  }
  return PR_BILLING.displayCoins;
}
