"use client";

import { useEffect } from "react";
import { cakeDetailPrefetchStartCount } from "@/workspaces/storefront/catalog/cake-detail-prefetch";
import { logCheckoutClient } from "@/lib/perf/dev-only-client";
import { consumeStorefrontNavIntent } from "@/lib/perf/storefront-nav-client";

/** DEV-only Browse request baseline. Does not change customer UI. */
export function StorefrontBrowsePerfProbe({
  cakeCount,
}: {
  cakeCount: number;
}) {
  useEffect(() => {
    const nav = consumeStorefrontNavIntent({
      href: "/browse",
      kinds: ["browse", "back"],
    });
    logCheckoutClient("BROWSE_NAV", {
      cakeCards: cakeCount,
      cakeDetailLinks: cakeCount * 3,
      viewportCakePrefetches: 0,
      intentPrefetchStarts: cakeDetailPrefetchStartCount(),
      correlationId: nav?.correlationId,
      kind: nav?.kind,
      intentToVisibleMs: nav?.intentToVisibleMs,
      note: nav?.kind === "back" ? "history_restore_or_refetch" : "intent_prefetch_only",
    });
  }, [cakeCount]);
  return null;
}
