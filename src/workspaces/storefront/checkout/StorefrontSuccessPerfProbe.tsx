"use client";

import { useEffect, useRef } from "react";
import {
  SUCCESS_PAGE_VISIBLE,
  consumeCheckoutServerLogKey,
  logCheckoutClient,
  logSubmitPhaseSummary,
  markCheckoutPerf,
  readCheckoutSubmitTiming,
  type CheckoutServerPerf,
} from "@/lib/perf/dev-only-client";

/** Invisible DEV measurement hook. Does not change Order Received UI. */
export function StorefrontSuccessPerfProbe({
  successServer,
}: {
  successServer?: CheckoutServerPerf;
}) {
  const loggedServerKey = useRef<string | null>(null);
  useEffect(() => {
    markCheckoutPerf(SUCCESS_PAGE_VISIBLE);
    const timing = readCheckoutSubmitTiming();
    if (timing) {
      logSubmitPhaseSummary(timing, Date.now());
    }
    if (!successServer) return;
    const correlationId = timing?.correlationId ?? successServer.correlationId;
    const key = `success:${correlationId}:${successServer.totalServerMs}`;
    if (loggedServerKey.current === key) return;
    if (!consumeCheckoutServerLogKey(key)) return;
    loggedServerKey.current = key;
    logCheckoutClient("CHECKOUT_SUCCESS_SERVER", {
      correlationId,
      totalSuccessServerMs: successServer.totalServerMs,
      ...Object.fromEntries(
        successServer.steps.map((step) => [step.name, `${step.ms}ms`]),
      ),
    });
  }, [successServer]);
  return null;
}
