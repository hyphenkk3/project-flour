"use client";

import { useEffect, useRef } from "react";
import {
  elapsedPerfMs,
  logCheckoutClient,
  readCheckoutSubmitTiming,
} from "@/lib/perf/dev-only-client";

/** DEV-only Order Received recap milestones. Does not change customer UI. */
export function SuccessRecapPerfProbe({
  hasAdjustment,
  hasDate,
  hasItem,
  hasOrderNumber,
  hasTotal,
}: {
  hasAdjustment: boolean;
  hasDate: boolean;
  hasItem: boolean;
  hasOrderNumber: boolean;
  hasTotal: boolean;
}) {
  const logged = useRef(false);

  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    const timing = readCheckoutSubmitTiming();
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    logCheckoutClient("CHECKOUT_CLIENT", {
      correlationId: timing?.correlationId ?? null,
      step: "recap_usable",
      confirmToRecapItemMs: hasItem
        ? elapsedPerfMs(timing?.confirmClickAt, now)
        : null,
      confirmToRecapDateMs: hasDate
        ? elapsedPerfMs(timing?.confirmClickAt, now)
        : null,
      confirmToRecapTotalMs: hasTotal
        ? elapsedPerfMs(timing?.confirmClickAt, now)
        : null,
      confirmToRecapAdjustmentMs: hasAdjustment
        ? elapsedPerfMs(timing?.confirmClickAt, now)
        : null,
      confirmToRecapOrderNumberMs: hasOrderNumber
        ? elapsedPerfMs(timing?.confirmClickAt, now)
        : null,
      note: "authoritative_receipt_recap_committed",
    });
  }, [hasAdjustment, hasDate, hasItem, hasOrderNumber, hasTotal]);

  return null;
}
