"use client";

import { useEffect, useState } from "react";
import {
  FRESH_PICK_CART_CHANGED_EVENT,
  readFreshPickCart,
  type FreshPickCart,
} from "@/workspaces/storefront/extra/fresh-pick-cart";

export function useFreshPickCart(): FreshPickCart | null {
  const [cart, setCart] = useState<FreshPickCart | null>(null);

  useEffect(() => {
    function refresh() {
      setCart(readFreshPickCart());
    }
    refresh();
    window.addEventListener(FRESH_PICK_CART_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(FRESH_PICK_CART_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return cart;
}
