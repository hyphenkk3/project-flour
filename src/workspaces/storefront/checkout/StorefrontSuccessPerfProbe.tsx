"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import {
  SUCCESS_PAGE_VISIBLE,
  consumeCheckoutServerLogKey,
  logCheckoutClient,
  logSubmitPhaseSummary,
  markCheckoutPerf,
  readCheckoutSubmitTiming,
  type CheckoutServerPerf,
} from "@/lib/perf/dev-only-client";

function deltaMs(from: number | null | undefined, to: number): number | null {
  if (from == null || !Number.isFinite(from)) return null;
  return to - from;
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
    commitAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (!markVisible || loggedNav.current) return;
    loggedNav.current = true;
    markCheckoutPerf(SUCCESS_PAGE_VISIBLE);
    const visibleAt = Date.now();
    const timing = readCheckoutSubmitTiming();
    if (timing) {
      logSubmitPhaseSummary(timing, visibleAt);
    }
    const clientCommitAt = commitAt.current;
    const requestAt = successServer?.serverRequestAt;
    logCheckoutClient("CHECKOUT_NAV", {
      correlationId: timing?.correlationId ?? successServer?.correlationId ?? null,
      actionReturnToNavigationStartMs:
        timing?.actionReturnAt == null || timing.navigationStartAt == null
          ? null
          : timing.navigationStartAt - timing.actionReturnAt,
      navigationStartToServerStartMs:
        requestAt == null
          ? null
          : deltaMs(timing?.navigationStartAt, requestAt),
      serverReceiptDataMs: successServer?.serverReceiptDataMs ?? null,
      serverRenderMs: successServer?.serverRenderMs ?? null,
      navigationToClientCommitMs: deltaMs(
        timing?.navigationStartAt,
        clientCommitAt ?? visibleAt,
      ),
      clientCommitToVisibleMs:
        clientCommitAt == null ? null : visibleAt - clientCommitAt,
      navigationStartToSuccessVisibleMs: deltaMs(
        timing?.navigationStartAt,
        visibleAt,
      ),
      note: "heading_visible_receipt_may_still_be_pending",
    });
  }, [markVisible, successServer]);

  useEffect(() => {
    if (!successServer) return;
    const timing = readCheckoutSubmitTiming();
    const correlationId = timing?.correlationId ?? successServer.correlationId;
    const key = `success:${correlationId}:${successServer.totalServerMs}`;
    if (loggedServerKey.current === key) return;
    if (!consumeCheckoutServerLogKey(key)) return;
    loggedServerKey.current = key;
    const navigationStartToServerStartMs =
      successServer.serverRequestAt == null ||
      timing?.navigationStartAt == null
        ? null
        : successServer.serverRequestAt - timing.navigationStartAt;
    logCheckoutClient("CHECKOUT_SUCCESS_SERVER", {
      correlationId,
      totalSuccessServerMs: successServer.totalServerMs,
      navigationStartToServerStartMs,
      serverReceiptDataMs: successServer.serverReceiptDataMs ?? null,
      serverRenderMs: successServer.serverRenderMs ?? null,
      ...Object.fromEntries(
        successServer.steps.map((step) => [step.name, `${step.ms}ms`]),
      ),
    });
    logCheckoutClient("CHECKOUT_NAV", {
      correlationId,
      navigationStartToServerStartMs,
      serverReceiptDataMs: successServer.serverReceiptDataMs ?? null,
      serverRenderMs: successServer.serverRenderMs ?? null,
      note: "receipt_server_stages",
    });
  }, [successServer]);

  return null;
}
