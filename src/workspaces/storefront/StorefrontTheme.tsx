"use client";

import { useEffect } from "react";

/** Warm storefront palette without changing staff workspace tokens. */
export function StorefrontTheme() {
  useEffect(() => {
    document.documentElement.classList.add("storefront-canvas");
    return () => {
      document.documentElement.classList.remove("storefront-canvas");
    };
  }, []);

  return null;
}
