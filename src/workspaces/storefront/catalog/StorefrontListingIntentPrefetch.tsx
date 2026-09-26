"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { markStorefrontNavIntent } from "@/lib/perf/storefront-nav-client";

function listingHref(href: string | null): "/browse" | null {
  if (href === "/browse") return "/browse";
  return null;
}

/**
 * Starts Browse RSC on pointer/keyboard intent.
 * Does not viewport-prefetch cake detail.
 */
export function StorefrontListingIntentPrefetch() {
  const router = useRouter();

  useEffect(() => {
    function onIntent(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (anchor?.hasAttribute("data-cake-detail-back")) return;
      const href = listingHref(anchor?.getAttribute("href") ?? null);
      if (!href) return;
      markStorefrontNavIntent(href, "browse");
      void router.prefetch(href);
    }

    document.addEventListener("pointerdown", onIntent, true);
    document.addEventListener("focusin", onIntent, true);
    return () => {
      document.removeEventListener("pointerdown", onIntent, true);
      document.removeEventListener("focusin", onIntent, true);
    };
  }, [router]);

  return null;
}
