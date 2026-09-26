import type { ReactNode } from "react";
import { StorefrontCakePaintRouteSync } from "@/workspaces/storefront/catalog/StorefrontCakePaintRouteSync";
import { StorefrontListingIntentPrefetch } from "@/workspaces/storefront/catalog/StorefrontListingIntentPrefetch";
import { StorefrontPinchZoomLock } from "@/workspaces/storefront/StorefrontPinchZoomLock";
import { StorefrontTheme } from "@/workspaces/storefront/StorefrontTheme";

/** Full-viewport storefront canvas. Uses the existing paper token, not staff mist. */
export function StorefrontShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="bg-paper min-h-dvh">
      <StorefrontPinchZoomLock />
      <StorefrontTheme />
      <StorefrontListingIntentPrefetch />
      <StorefrontCakePaintRouteSync />
      {children}
    </div>
  );
}
