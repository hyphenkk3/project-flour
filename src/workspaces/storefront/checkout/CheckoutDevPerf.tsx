"use client";

import { useEffect, useRef } from "react";
import {
  CHECKOUT_ACTION_RETURN,
  CHECKOUT_ACTION_START,
  CHECKOUT_CONFIRM_CLICK,
  SUCCESS_NAVIGATION_START,
  createPerfCorrelationId,
  logCheckoutClient,
  markCheckoutLoadOnce,
  markCheckoutPerf,
  readCheckoutSubmitTiming,
  startCheckoutLoadClock,
  writeCheckoutSubmitTiming,
} from "@/lib/perf/dev-only-client";

export function CheckoutLoadStepProbe({
  step,
}: {
  step: string;
}) {
  const seen = useRef(new Set<string>());
  useEffect(() => {
    startCheckoutLoadClock();
    markCheckoutLoadOnce(step, seen.current);
  }, [step]);
  return null;
}

export function CheckoutSubmitUsableProbe({
  blocked,
}: {
  blocked: boolean;
}) {
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (blocked) return;
    markCheckoutLoadOnce("submit_usable", seen.current);
  }, [blocked]);
  return null;
}

export function useCheckoutActionReturnPerf(
  pending: boolean,
  flow: "preorder" | "extra",
): void {
  const wasPending = useRef(false);
  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    markCheckoutPerf(CHECKOUT_ACTION_RETURN);
    const existing = readCheckoutSubmitTiming();
    if (existing) {
      writeCheckoutSubmitTiming({
        ...existing,
        actionReturnAt: Date.now(),
      });
    }
    logCheckoutClient(flow === "extra" ? "EXTRA_CLIENT" : "CHECKOUT_CLIENT", {
      correlationId: existing?.correlationId ?? null,
      step: "action_return",
      note: "pending_became_false_after_formAction",
    });
  }, [flow, pending]);
}

export function beginCheckoutSubmitPerf(input: {
  formData: FormData;
  flow: "preorder" | "extra";
}): string {
  const correlationId = createPerfCorrelationId();
  input.formData.set("perf_correlation_id", correlationId);
  const now = Date.now();
  markCheckoutPerf(CHECKOUT_CONFIRM_CLICK);
  markCheckoutPerf(CHECKOUT_ACTION_START);
  writeCheckoutSubmitTiming({
    correlationId,
    flow: input.flow,
    confirmClickAt: now,
    actionDispatchAt: now,
  });
  logCheckoutClient(input.flow === "extra" ? "EXTRA_CLIENT" : "CHECKOUT_CLIENT", {
    correlationId,
    step: "confirm_click",
    note: "client_action_start_is_formAction_dispatch_not_server_start",
  });
  return correlationId;
}

export function beginSuccessNavigationPerf(): void {
  markCheckoutPerf(SUCCESS_NAVIGATION_START);
  const existing = readCheckoutSubmitTiming();
  if (!existing) return;
  writeCheckoutSubmitTiming({
    ...existing,
    navigationStartAt: Date.now(),
  });
}
