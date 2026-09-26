"use client";

import { useEffect } from "react";
import { logCheckoutClient } from "@/lib/perf/dev-only-client";
import { consumeStorefrontNavIntent } from "@/lib/perf/storefront-nav-client";

/** DEV-only cake-detail navigation timing. Does not change customer UI. */
export function StorefrontCakeDetailPerfProbe({
  cakeId,
  phase,
}: {
  cakeId: string;
  phase: "preview" | "live";
}) {
  useEffect(() => {
    const href = `/cakes/${cakeId}`;
    const nav = consumeStorefrontNavIntent({
      href,
      kinds: ["cake"],
    });
    logCheckoutClient("STOREFRONT_NAV", {
      kind: "cake",
      phase,
      cakeId,
      correlationId: nav?.correlationId,
      intentToVisibleMs: nav?.intentToVisibleMs,
    });

    const hero = document.querySelector("main img");
    if (!(hero instanceof HTMLImageElement)) return;
    const started = performance.now();
    function logImage(state: "already" | "loaded") {
      logCheckoutClient("STOREFRONT_NAV", {
        kind: "cake_image",
        phase,
        cakeId,
        imageState: state,
        imageWaitMs: Math.round(performance.now() - started),
      });
    }
    if (hero.complete) {
      logImage("already");
      return;
    }
    function onLoad() {
      logImage("loaded");
    }
    hero.addEventListener("load", onLoad, { once: true });
    return () => hero.removeEventListener("load", onLoad);
  }, [cakeId, phase]);
  return null;
}
