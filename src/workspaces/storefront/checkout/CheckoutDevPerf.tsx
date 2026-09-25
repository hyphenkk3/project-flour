"use client";

import { useEffect, useRef } from "react";
import {
  CHECKOUT_ACTION_RETURN,
  CHECKOUT_ACTION_START,
  CHECKOUT_CONFIRM_CLICK,
  SUCCESS_NAVIGATION_START,
  consumeCheckoutServerLogKey,
  createPerfCorrelationId,
  elapsedPerfMs,
  logCheckoutClient,
  logCheckoutServerPerf,
  markCheckoutActionReturned as stampActionReturned,
  markCheckoutLoadOnce,
  markCheckoutNavigationCall,
  markCheckoutPerf,
  readCheckoutSubmitTiming,
  startCheckoutAttemptTiming,
  startCheckoutLoadClock,
  type CheckoutServerPerf,
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
  serverPerf?: CheckoutServerPerf,
): void {
  const wasPending = useRef(false);
  const loggedServerKey = useRef<string | null>(null);
  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    markCheckoutPerf(CHECKOUT_ACTION_RETURN);
    const existing = readCheckoutSubmitTiming();
    logCheckoutClient(flow === "extra" ? "EXTRA_CLIENT" : "CHECKOUT_CLIENT", {
      correlationId: existing?.correlationId ?? serverPerf?.correlationId ?? null,
      step: "action_return",
      note: "pending_became_false_after_formAction",
    });
    if (!serverPerf) return;
    const key = `submit:${serverPerf.correlationId}:${serverPerf.totalServerMs}`;
    if (loggedServerKey.current === key) return;
    if (!consumeCheckoutServerLogKey(key)) return;
    loggedServerKey.current = key;
    logCheckoutServerPerf(serverPerf);
    logCheckoutClient("CHECKOUT_SERVER_SUMMARY", {
      correlationId: serverPerf.correlationId,
      totalServerMs: serverPerf.totalServerMs,
      confirmToActionReturnMs: elapsedPerfMs(
        existing?.confirmClickAt,
        existing?.actionReturnAt,
      ),
      confirmToSuccessVisibleMs: null,
    });
  }, [flow, pending, serverPerf]);

  useEffect(() => {
    if (pending || !serverPerf) return;
    const key = `submit:${serverPerf.correlationId}:${serverPerf.totalServerMs}`;
    if (loggedServerKey.current === key) return;
    if (!consumeCheckoutServerLogKey(key)) return;
    loggedServerKey.current = key;
    logCheckoutServerPerf(serverPerf);
    const existing = readCheckoutSubmitTiming();
    logCheckoutClient("CHECKOUT_SERVER_SUMMARY", {
      correlationId: serverPerf.correlationId,
      totalServerMs: serverPerf.totalServerMs,
      confirmToActionReturnMs: elapsedPerfMs(
        existing?.confirmClickAt,
        existing?.actionReturnAt,
      ),
      confirmToSuccessVisibleMs: null,
    });
  }, [pending, serverPerf]);
}

export function beginCheckoutSubmitPerf(input: {
  formData: FormData;
  flow: "preorder" | "extra";
}): string {
  const correlationId = createPerfCorrelationId();
  input.formData.set("perf_correlation_id", correlationId);
  markCheckoutPerf(CHECKOUT_CONFIRM_CLICK);
  markCheckoutPerf(CHECKOUT_ACTION_START);
  startCheckoutAttemptTiming(correlationId, input.flow);
  logCheckoutClient(input.flow === "extra" ? "EXTRA_CLIENT" : "CHECKOUT_CLIENT", {
    correlationId,
    step: "confirm_click",
    note: "confirm_click_dispatches_server_action",
  });
  return correlationId;
}

export function beginSuccessNavigationPerf(): void {
  markCheckoutPerf(SUCCESS_NAVIGATION_START);
  markCheckoutNavigationCall();
}

export function markCheckoutActionReturned(): void {
  markCheckoutPerf(CHECKOUT_ACTION_RETURN);
  stampActionReturned();
}

type GuestSubmitResult = {
  error: string | null;
  orderId?: string;
  perf?: CheckoutServerPerf;
};

/** Await the server action, then navigate on success without a second render. */
export async function submitGuestOrderAndNavigate<T extends GuestSubmitResult>(
  input: {
    formData: FormData;
    flow: "preorder" | "extra";
    action: (prev: T, formData: FormData) => Promise<T>;
    hrefForOrderId: (orderId: string) => string;
    replace: (href: string) => void;
    markNavigated: () => void;
  },
): Promise<T> {
  beginCheckoutSubmitPerf({ formData: input.formData, flow: input.flow });
  const result = await input.action({ error: null } as T, input.formData);
  markCheckoutActionReturned();
  if (result.perf) {
    logCheckoutServerPerf(result.perf);
  }
  const timing = readCheckoutSubmitTiming();
  logCheckoutClient(input.flow === "extra" ? "EXTRA_CLIENT" : "CHECKOUT_CLIENT", {
    correlationId: timing?.correlationId ?? result.perf?.correlationId ?? null,
    step: "action_return",
    confirmToActionReturnMs: elapsedPerfMs(
      timing?.confirmClickAt,
      timing?.actionReturnAt,
    ),
    note: "server_action_promise_resolved",
  });
  if (result.error || !result.orderId) {
    return result;
  }
  input.markNavigated();
  beginSuccessNavigationPerf();
  const afterNav = readCheckoutSubmitTiming();
  logCheckoutClient(input.flow === "extra" ? "EXTRA_CLIENT" : "CHECKOUT_CLIENT", {
    correlationId: afterNav?.correlationId ?? result.perf?.correlationId ?? null,
    step: "navigation_call",
    actionReturnToNavigationCallMs: elapsedPerfMs(
      afterNav?.actionReturnAt,
      afterNav?.navigationCallAt,
    ),
  });
  input.replace(input.hrefForOrderId(result.orderId));
  return result;
}
