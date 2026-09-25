"use client";

import { useEffect } from "react";
import { cakeDetailPrefetchStartCount } from "@/workspaces/storefront/catalog/cake-detail-prefetch";
import { logCheckoutClient } from "@/lib/perf/dev-only-client";

/** DEV-only Browse request baseline. Does not change customer UI. */
export function StorefrontBrowsePerfProbe({
  cakeCount,
}: {
  cakeCount: number;
}) {
  useEffect(() => {
    logCheckoutClient("BROWSE_NAV", {
      cakeCards: cakeCount,
      cakeDetailLinks: cakeCount * 3,
      viewportCakePrefetches: 0,
      intentPrefetchStarts: cakeDetailPrefetchStartCount(),
      note: "intent_prefetch_only",
    });
  }, [cakeCount]);
  return null;
}
