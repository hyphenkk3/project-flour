"use client";

import { useEffect } from "react";

let storefrontCanvasUsers = 0;

/** Warm storefront palette without changing staff workspace tokens. */
export function StorefrontTheme() {
  useEffect(() => {
    storefrontCanvasUsers += 1;
    document.documentElement.classList.add("storefront-canvas");
    return () => {
      storefrontCanvasUsers -= 1;
      if (storefrontCanvasUsers === 0) {
        document.documentElement.classList.remove("storefront-canvas");
      }
    };
  }, []);

  return null;
}
