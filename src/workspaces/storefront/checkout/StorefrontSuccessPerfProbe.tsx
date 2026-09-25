"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  SUCCESS_PAGE_VISIBLE,
  consumeCheckoutServerLogKey,
  elapsedPerfMs,
  logCheckoutClient,
  logSubmitPhaseSummary,
  markCheckoutPerf,
  readActiveSuccessNavigation,
  readCheckoutCorrelationId,
  readCheckoutSubmitTiming,
  type CheckoutServerPerf,
} from "@/lib/perf/dev-only-client";

function successPageNow(): number {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

/** Invisible DEV measurement hook. Does not change Order Received UI. */
export function StorefrontSuccessPerfProbe({
  successServer,
  markVisible = false,
}: {
  successServer?: CheckoutServerPerf;
  markVisible?: boolean;
}) {
  const commitAt = useRef<number | null>(null);
  const loggedNav = useRef(false);
  const loggedServerKey = useRef<string | null>(null);

  useLayoutEffect(() => {
    commitAt.current = successPageNow();
  }, []);

  useEffect(() => {
    if (!markVisible || loggedNav.current) return;
    loggedNav.current = true;
    markCheckoutPerf(SUCCESS_PAGE_VISIBLE);
    const visibleAt = successPageNow();
    const timing = readCheckoutSubmitTiming();
    const correlationId =
      timing?.correlationId ??
      readCheckoutCorrelationId() ??
      successServer?.correlationId ??
      null;
    if (timing) {
      logSubmitPhaseSummary(timing, visibleAt);
    } else {
      logCheckoutClient("CHECKOUT_CLIENT", {
        correlationId,
        confirmToSuccessVisibleMs: null,
        note: "success_page_is_new_timing_origin",
      });
    }
    const navigation = readActiveSuccessNavigation(correlationId);
    const clientCommitAt = commitAt.current;
    logCheckoutClient("CHECKOUT_NAV", {
      correlationId,
      actionReturnToNavigationCallMs: elapsedPerfMs(
        timing?.actionReturnAt,
        timing?.navigationCallAt,
      ),
      successPageNavigationToClientCommitMs: elapsedPerfMs(
        navigation?.navigationCallAt,
        clientCommitAt,
      ),
      successPageNavigationToVisibleMs: elapsedPerfMs(
        navigation?.navigationCallAt,
        visibleAt,
      ),
      confirmToSuccessVisibleMs: elapsedPerfMs(
        timing?.confirmClickAt,
        visibleAt,
      ),
      successPageReceiptDataMs: successServer?.serverReceiptDataMs ?? null,
      successPageServerRenderMs: successServer?.serverRenderMs ?? null,
      note: navigation
        ? "same_document_navigation_from_router_replace"
        : "success_navigation_timing_unavailable_new_document",
    });
  }, [markVisible, successServer]);

  useEffect(() => {
    if (!successServer) return;
    const timing = readCheckoutSubmitTiming();
    const correlationId =
      timing?.correlationId ??
      readCheckoutCorrelationId() ??
      successServer.correlationId;
    const key = `success:${correlationId}:${successServer.totalServerMs}`;
    if (loggedServerKey.current === key) return;
    if (!consumeCheckoutServerLogKey(key)) return;
    loggedServerKey.current = key;
    logCheckoutClient("CHECKOUT_SUCCESS_SERVER", {
      correlationId,
      totalSuccessServerMs: successServer.totalServerMs,
      successPageReceiptDataMs: successServer.serverReceiptDataMs ?? null,
      successPageServerRenderMs: successServer.serverRenderMs ?? null,
      ...Object.fromEntries(
        successServer.steps.map((step) => [step.name, `${step.ms}ms`]),
      ),
    });
  }, [successServer]);

  return null;
}
