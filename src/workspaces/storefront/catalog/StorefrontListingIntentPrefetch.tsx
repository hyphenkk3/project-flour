"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { markStorefrontNavIntent } from "@/lib/perf/storefront-nav-client";

function listingHref(href: string | null): "/browse" | null {
  if (href === "/browse") return "/browse";
  return null;
}

function collectionHref(anchor: HTMLAnchorElement | null): string | null {
  if (!anchor?.hasAttribute("data-storefront-collection-intent")) return null;
  const href = anchor.getAttribute("href");
  return href?.startsWith("/order/collection/") ? href : null;
}

/**
 * Starts Browse and featured-collection RSC on pointer/keyboard intent.
 * Does not viewport-prefetch cake detail.
 */
export function StorefrontListingIntentPrefetch() {
  const router = useRouter();

  useEffect(() => {
    let hoverTimer = 0;

    function warmCollection(anchor: HTMLAnchorElement) {
      const href = collectionHref(anchor);
      if (!href) return;
      markStorefrontNavIntent(href, "collection");
      void router.prefetch(href);
    }

    function clearHoverTimer() {
      window.clearTimeout(hoverTimer);
      hoverTimer = 0;
    }

    function onIntent(event: Event) {
      clearHoverTimer();
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (anchor?.hasAttribute("data-cake-detail-back")) return;
      const href = listingHref(anchor?.getAttribute("href") ?? null);
      if (href) {
        markStorefrontNavIntent(href, "browse");
        void router.prefetch(href);
        return;
      }
      if (anchor instanceof HTMLAnchorElement) warmCollection(anchor);
    }

    function onPointerOver(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement) || !collectionHref(anchor)) {
        return;
      }
      if (
        event.relatedTarget instanceof Node &&
        anchor.contains(event.relatedTarget)
      ) {
        return;
      }
      clearHoverTimer();
      hoverTimer = window.setTimeout(() => warmCollection(anchor), 120);
    }

    function onPointerOut(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement) || !collectionHref(anchor)) {
        return;
      }
      if (
        event.relatedTarget instanceof Node &&
        anchor.contains(event.relatedTarget)
      ) {
        return;
      }
      clearHoverTimer();
    }

    document.addEventListener("pointerdown", onIntent, true);
    document.addEventListener("focusin", onIntent, true);
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    return () => {
      clearHoverTimer();
      document.removeEventListener("pointerdown", onIntent, true);
      document.removeEventListener("focusin", onIntent, true);
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
    };
  }, [router]);

  return null;
}
