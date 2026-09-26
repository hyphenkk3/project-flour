"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { syncStorefrontCakePaintOverlay } from "@/workspaces/storefront/catalog/storefront-cake-paint-hint";

/** Keeps the first-paint overlay aligned with the current storefront route. */
export function StorefrontCakePaintRouteSync() {
  const pathname = usePathname();

  useEffect(() => {
    syncStorefrontCakePaintOverlay(pathname);
  }, [pathname]);

  return null;
}
