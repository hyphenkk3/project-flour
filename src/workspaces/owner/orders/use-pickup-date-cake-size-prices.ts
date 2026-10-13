"use client";

import { useEffect, useRef, useState } from "react";
import { resolveCheckoutCakeSizePrices } from "@/workspaces/storefront/checkout/actions";
import {
  cakeSizePriceRequestKey,
  isCurrentCakeSizePriceResponse,
} from "@/workspaces/owner/orders/pickup-date-cake-size-prices";

type Resolution = {
  key: string;
  attempt: number;
  prices: Record<string, number>;
  failed: boolean;
};

/** Display state is scoped to the current date and size set. SQL remains authoritative. */
export function usePickupDateCakeSizePrices(
  pickupDate: string,
  sizeIds: readonly string[],
) {
  const key = cakeSizePriceRequestKey(pickupDate, sizeIds);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [attempt, setAttempt] = useState(0);
  const currentKey = useRef(key);
  const currentAttempt = useRef(attempt);

  useEffect(() => {
    currentKey.current = key;
    currentAttempt.current = attempt;
    if (!key) return;
    let cancelled = false;
    const [date, ids] = key.split("|");
    void resolveCheckoutCakeSizePrices(date, ids.split(","))
      .then((prices) => {
        if (
          cancelled ||
          !isCurrentCakeSizePriceResponse({
            responseKey: key,
            responseAttempt: attempt,
            currentKey: currentKey.current,
            currentAttempt: currentAttempt.current,
          })
        )
          return;
        setResolution({
          key,
          attempt,
          prices,
          failed: ids.split(",").some((id) => !Number.isFinite(prices[id])),
        });
      })
      .catch(() => {
        if (
          !cancelled &&
          isCurrentCakeSizePriceResponse({
            responseKey: key,
            responseAttempt: attempt,
            currentKey: currentKey.current,
            currentAttempt: currentAttempt.current,
          })
        ) {
          setResolution({ key, attempt, prices: {}, failed: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const current =
    resolution?.key === key && resolution.attempt === attempt
      ? resolution
      : null;
  return {
    prices: current?.prices ?? {},
    status: !key
      ? "idle"
      : !current
        ? "loading"
        : current.failed
          ? "error"
          : "ready",
    retry: () => {
      currentAttempt.current += 1;
      setResolution(null);
      setAttempt((value) => value + 1);
    },
  } as const;
}
