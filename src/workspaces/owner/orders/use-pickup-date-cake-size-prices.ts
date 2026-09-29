"use client";

import { useEffect, useState } from "react";
import { resolveCheckoutCakeSizePrices } from "@/workspaces/storefront/checkout/actions";

const pickupDatePriceCache = new Map<string, Record<string, number>>();

function pickupDateYmd(value: string): string | null {
  const key = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function sizeIdsKey(ids: readonly string[]): string {
  return [
    ...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)),
  ]
    .sort()
    .join(",");
}

/**
 * Display-only pickup-date cake-size prices via library_cake_size_price_on.
 * Does not change order create/submit payloads.
 */
export function usePickupDateCakeSizePrices(
  pickupDate: string,
  sizeIds: readonly string[],
): Record<string, number> {
  const date = pickupDateYmd(pickupDate);
  const idsKey = sizeIdsKey(sizeIds);
  const cacheKey = date && idsKey ? `${date}|${idsKey}` : "";
  const [, setCacheRevision] = useState(0);

  useEffect(() => {
    if (!date || !idsKey) {
      return;
    }
    if (pickupDatePriceCache.has(cacheKey)) {
      return;
    }
    let cancelled = false;
    void resolveCheckoutCakeSizePrices(date, idsKey.split(",")).then(
      (prices) => {
        pickupDatePriceCache.set(cacheKey, prices);
        if (cancelled) return;
        setCacheRevision((current) => current + 1);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [cacheKey, date, idsKey]);

  if (!date) return {};
  return pickupDatePriceCache.get(cacheKey) ?? {};
}
