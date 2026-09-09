"use client";

import { useEffect } from "react";
import { clearFreshPickCart } from "@/workspaces/storefront/extra/fresh-pick-cart";

export function ClearFreshPickCartOnSuccess() {
  useEffect(() => {
    clearFreshPickCart();
  }, []);
  return null;
}
