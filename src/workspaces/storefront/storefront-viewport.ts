import type { Viewport } from "next";

/**
 * Public customer storefront only. Staff layouts must not import this.
 *
 * Next.js emits a single viewport meta tag from this object:
 * width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no
 *
 * iOS WebKit (Safari and Chrome on iPhone) ignores user-scalable / maximum-scale.
 * StorefrontPinchZoomLock complements this for those browsers.
 */
export const storefrontViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};
