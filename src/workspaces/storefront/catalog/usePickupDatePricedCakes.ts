"use client";

import { useEffect, useState } from "react";
import type { StorefrontCake } from "@/types/storefront";
import { resolveCheckoutCakeSizePrices } from "@/workspaces/storefront/checkout/actions";
import { applyResolvedPickupDatePrices } from "@/workspaces/storefront/catalog/pickup-date-pricing";

type PriceResolution = {
  key: string;
  prices: Record<string, number>;
};

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Resolve displayed cake prices with the same pickup-date RPC as checkout. */
export function usePickupDatePricedCakes(
  cakes: readonly StorefrontCake[],
  pickupDate: string | null | undefined,
): { cakes: StorefrontCake[]; ready: boolean } {
  const date = pickupDate?.trim().slice(0, 10) ?? "";
  const sizeIdsKey = [
    ...new Set(cakes.flatMap((cake) => cake.sizes.map((size) => size.id))),
  ]
    .sort()
    .join(",");
  const key = `${date}|${sizeIdsKey}`;
  const sizeIds = sizeIdsKey ? sizeIdsKey.split(",") : [];
  const [resolution, setResolution] = useState<PriceResolution | null>(null);

  useEffect(() => {
    if (!isYmd(date) || sizeIds.length === 0) return;
    let cancelled = false;
    void resolveCheckoutCakeSizePrices(date, sizeIds).then((prices) => {
      if (!cancelled) setResolution({ key, prices });
    });
    return () => {
      cancelled = true;
    };
  }, [date, key]);

  if (!isYmd(date) || sizeIds.length === 0) {
    return { cakes: cakes.map((cake) => ({ ...cake })), ready: true };
  }
  const ready =
    resolution?.key === key && sizeIds.every((id) => resolution.prices[id] != null);
  if (!ready) return { cakes: cakes.map((cake) => ({ ...cake })), ready: false };

  return {
    cakes: applyResolvedPickupDatePrices(cakes, resolution.prices),
    ready: true,
  };
}
