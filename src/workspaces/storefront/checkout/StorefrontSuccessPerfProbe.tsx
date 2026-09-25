"use client";

import { useEffect } from "react";
import {
  SUCCESS_PAGE_VISIBLE,
  logSubmitPhaseSummary,
  markCheckoutPerf,
  readCheckoutSubmitTiming,
} from "@/lib/perf/dev-only-client";

/** Invisible DEV measurement hook. Does not change Order Received UI. */
export function StorefrontSuccessPerfProbe() {
  useEffect(() => {
    markCheckoutPerf(SUCCESS_PAGE_VISIBLE);
    const timing = readCheckoutSubmitTiming();
    if (!timing) return;
    logSubmitPhaseSummary(timing, Date.now());
  }, []);
  return null;
}
