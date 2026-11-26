'use client';

import { useMemo, useState } from 'react';
import { mergeProducts, referenceDay } from '@/lib/research/metrics';
import { marketplaceName } from '@/data/marketplaces';
import { pickLabel } from '@/lib/research/myEntries';

// The filters both data pages share (Daily History, Products) and what they
// narrow: the open search's products → by market place → the reference day
// (the latest tracked day inside the date filter). `r` = useResearch().
export function useResearchView(r) {
  const [platform, setPlatform] = useState('all');
  const [dateRange, setDateRange] = useState({ preset: 'all', from: null, to: null });

  const allProducts = useMemo(() => mergeProducts(r.data?.tracks), [r.data]);
  const platformOptions = useMemo(() => [...new Set(allProducts.map((p) => marketplaceName(p.platform)))].sort(), [allProducts]);
  const products = useMemo(
    () => (platform === 'all' ? allProducts : allProducts.filter((p) => platform.includes(marketplaceName(p.platform)))),
    [allProducts, platform],
  );
  const { from, to } = dateRange;
  const refDay = useMemo(() => referenceDay(products, to), [products, to]);

  return {
    platform, setPlatform, platformOptions,
    dateRange, setDateRange, from, to,
    allProducts, products, refDay,
    totalProducts: allProducts.length,
    // What's opening: the ticked entries' names (one entry on the admin's page).
    activeLabel: pickLabel((r.picked || (r.activeId ? [r.activeId] : [])).map((id) => r.searches.find((s) => s.id === id)?.query).filter(Boolean)),
  };
}
