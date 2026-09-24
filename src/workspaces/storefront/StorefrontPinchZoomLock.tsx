"use client";

import { useEffect } from "react";

const NO_PINCH_CLASS = "storefront-no-pinch-zoom";

/**
 * Blocks pinch-to-zoom on the customer storefront.
 *
 * Viewport maximumScale / userScalable is emitted correctly by Next.js, but
 * iOS WebKit (Safari and Chrome on iPhone) ignores those meta values. CSS
 * touch-action plus Safari gesture cancellation cover that gap without
 * intercepting single-finger scroll, taps, or form controls.
 */
export function StorefrontPinchZoomLock() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(NO_PINCH_CLASS);

    const blockPinchGesture = (event: Event) => {
      event.preventDefault();
    };

    // WebKit-only events. Not in the standard DocumentEventMap.
    root.addEventListener("gesturestart", blockPinchGesture, {
      passive: false,
    });
    root.addEventListener("gesturechange", blockPinchGesture, {
      passive: false,
    });

    return () => {
      root.classList.remove(NO_PINCH_CLASS);
      root.removeEventListener("gesturestart", blockPinchGesture);
      root.removeEventListener("gesturechange", blockPinchGesture);
    };
  }, []);

  return null;
}
