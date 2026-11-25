import { marketplaceById, marketplaceName } from '@/data/marketplaces';

// A marketplace's name on its own brand colour — a small pill. The colour is
// identity only; the name is always written.
export default function PlatformBadge({ platform }) {
  const m = marketplaceById(platform);
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
      style={{ backgroundColor: m?.color || '#64748b' }}
    >
      {marketplaceName(platform)}
    </span>
  );
}
