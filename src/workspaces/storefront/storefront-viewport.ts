import type { Viewport } from "next";

/** Public customer storefront only. Staff layouts must not import this. */
export const storefrontViewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};
