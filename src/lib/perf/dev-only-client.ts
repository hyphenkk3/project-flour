"use client";

import {
  createPerfCorrelationId,
  formatPerfLine,
  isDevPerfEnabled,
  type CheckoutServerPerf,
} from "@/lib/perf/dev-only-shared";

export { createPerfCorrelationId, isDevPerfEnabled };
export type { CheckoutServerPerf };

export const CHECKOUT_LOAD_STALE_MS = 30 * 60 * 1000;

export const CHECKOUT_CONFIRM_CLICK = "whitebird-checkout-confirm-click";
export const CHECKOUT_ACTION_START = "whitebird-checkout-action-start";
export const CHECKOUT_ACTION_RETURN = "whitebird-checkout-action-return";
export const SUCCESS_NAVIGATION_START = "whitebird-success-navigation-start";
export const SUCCESS_PAGE_VISIBLE = "whitebird-success-page-visible";

const SUBMIT_STORAGE_KEY = "wb-perf-checkout-submit-v1";
const LOAD_STORAGE_KEY = "wb-perf-checkout-load-v1";

export type CheckoutSubmitTiming = {
  correlationId: string;
  flow: "preorder" | "extra";
  confirmClickAt: number;
  actionDispatchAt: number | null;
  actionReturnAt: number | null;
  navigationStartAt: number | null;
};

function canUseBrowserTools(): boolean {
  return isDevPerfEnabled() && typeof window !== "undefined";
}

export function markCheckoutPerf(name: string): void {
  if (!canUseBrowserTools()) return;
  try {
    performance.mark(name);
  } catch {
    // Ignore missing Performance API.
  }
}

export function writeCheckoutSubmitTiming(
  patch: Partial<CheckoutSubmitTiming> &
    Pick<CheckoutSubmitTiming, "correlationId" | "flow">,
): CheckoutSubmitTiming {
  const current = readCheckoutSubmitTiming();
  const next: CheckoutSubmitTiming = {
    correlationId: patch.correlationId,
    flow: patch.flow,
    confirmClickAt: patch.confirmClickAt ?? current?.confirmClickAt ?? Date.now(),
    actionDispatchAt: patch.actionDispatchAt ?? current?.actionDispatchAt ?? null,
    actionReturnAt: patch.actionReturnAt ?? current?.actionReturnAt ?? null,
    navigationStartAt:
      patch.navigationStartAt ?? current?.navigationStartAt ?? null,
  };
  if (!canUseBrowserTools()) return next;
  try {
    sessionStorage.setItem(SUBMIT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota — skip persistence.
  }
  return next;
}

export function readCheckoutSubmitTiming(): CheckoutSubmitTiming | null {
  if (!canUseBrowserTools()) return null;
  try {
    const raw = sessionStorage.getItem(SUBMIT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckoutSubmitTiming;
    if (!parsed?.correlationId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function logCheckoutClient(
  scope:
    | "CHECKOUT_CLIENT"
    | "CHECKOUT_LOAD"
    | "EXTRA_CLIENT"
    | "CHECKOUT_SERVER"
    | "CHECKOUT_SERVER_SUMMARY"
    | "CHECKOUT_SUCCESS_SERVER"
    | "CHECKOUT_SUCCESS_PHOTO",
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!canUseBrowserTools()) return;
  const parts = Object.entries(fields).map(
    ([key, value]) => `${key}=${value == null ? "null" : String(value)}`,
  );
  console.info(formatPerfLine(scope, parts));
}

export function markCheckoutLoadOnce(
  step: string,
  seen: Set<string>,
  extra: Record<string, string | number | boolean | null | undefined> = {},
): void {
  if (seen.has(step)) return;
  seen.add(step);
  markCheckoutPerf(`whitebird-checkout-load-${step}`);
  const startedAt = readCheckoutLoadStartedAt();
  logCheckoutClient("CHECKOUT_LOAD", {
    step,
    elapsedMs: startedAt == null ? 0 : Date.now() - startedAt,
    ...extra,
  });
}

type CheckoutLoadClock = {
  startedAt: number;
  timeOrigin: number;
};

export function resolveCheckoutLoadClock(input: {
  stored: CheckoutLoadClock | null;
  now: number;
  timeOrigin: number;
  staleMs?: number;
}): { clock: CheckoutLoadClock; reset: boolean } {
  const staleMs = input.staleMs ?? CHECKOUT_LOAD_STALE_MS;
  const stored = input.stored;
  const shouldReset =
    !stored ||
    !Number.isFinite(stored.startedAt) ||
    !Number.isFinite(stored.timeOrigin) ||
    stored.timeOrigin !== input.timeOrigin ||
    stored.startedAt < input.timeOrigin ||
    input.now - stored.startedAt > staleMs;
  if (!shouldReset && stored) {
    return { clock: stored, reset: false };
  }
  return {
    clock: { startedAt: input.now, timeOrigin: input.timeOrigin },
    reset: true,
  };
}

function readStoredCheckoutLoadClock(): CheckoutLoadClock | null {
  if (!canUseBrowserTools()) return null;
  try {
    const raw = sessionStorage.getItem(LOAD_STORAGE_KEY);
    if (!raw) return null;
    if (/^\d+$/.test(raw)) {
      const startedAt = Number(raw);
      return Number.isFinite(startedAt)
        ? { startedAt, timeOrigin: 0 }
        : null;
    }
    const parsed = JSON.parse(raw) as CheckoutLoadClock;
    if (!parsed || !Number.isFinite(parsed.startedAt)) return null;
    return {
      startedAt: parsed.startedAt,
      timeOrigin: Number(parsed.timeOrigin) || 0,
    };
  } catch {
    return null;
  }
}

function writeCheckoutLoadClock(clock: CheckoutLoadClock): void {
  if (!canUseBrowserTools()) return;
  try {
    sessionStorage.setItem(LOAD_STORAGE_KEY, JSON.stringify(clock));
  } catch {
    // Private mode / quota — skip persistence.
  }
}

function readCheckoutLoadStartedAt(): number | null {
  if (!canUseBrowserTools()) return null;
  const resolved = resolveCheckoutLoadClock({
    stored: readStoredCheckoutLoadClock(),
    now: Date.now(),
    timeOrigin: performance.timeOrigin,
  });
  if (resolved.reset) writeCheckoutLoadClock(resolved.clock);
  return resolved.clock.startedAt;
}

export function startCheckoutLoadClock(): void {
  readCheckoutLoadStartedAt();
}

const LOGGED_SERVER_KEYS = "wb-perf-logged-server-v1";

export function consumeCheckoutServerLogKey(key: string): boolean {
  if (!canUseBrowserTools() || !key) return false;
  try {
    const raw = sessionStorage.getItem(LOGGED_SERVER_KEYS);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    if (seen.includes(key)) return false;
    sessionStorage.setItem(
      LOGGED_SERVER_KEYS,
      JSON.stringify([...seen, key].slice(-20)),
    );
    return true;
  } catch {
    return true;
  }
}

export function logCheckoutServerPerf(
  perf: CheckoutServerPerf,
  extra: Record<string, string | number | boolean | null | undefined> = {},
): void {
  if (!canUseBrowserTools()) return;
  logCheckoutClient("CHECKOUT_SERVER", {
    correlationId: perf.correlationId,
    totalServerMs: perf.totalServerMs,
    ...Object.fromEntries(perf.steps.map((step) => [step.name, `${step.ms}ms`])),
    ...extra,
  });
}

export function logSubmitPhaseSummary(
  timing: CheckoutSubmitTiming,
  successVisibleAt: number | null,
): void {
  const confirmToActionReturnMs =
    timing.actionReturnAt == null
      ? null
      : timing.actionReturnAt - timing.confirmClickAt;
  const actionReturnToNavigationStartMs =
    timing.actionReturnAt == null || timing.navigationStartAt == null
      ? null
      : timing.navigationStartAt - timing.actionReturnAt;
  const navigationStartToSuccessVisibleMs =
    timing.navigationStartAt == null || successVisibleAt == null
      ? null
      : successVisibleAt - timing.navigationStartAt;
  const confirmToSuccessVisibleMs =
    successVisibleAt == null ? null : successVisibleAt - timing.confirmClickAt;
  logCheckoutClient(timing.flow === "extra" ? "EXTRA_CLIENT" : "CHECKOUT_CLIENT", {
    correlationId: timing.correlationId,
    confirmToClientDispatchMs:
      timing.actionDispatchAt == null
        ? null
        : timing.actionDispatchAt - timing.confirmClickAt,
    confirmToActionReturnMs,
    actionReturnToNavigationStartMs,
    actionReturnToSuccessVisibleMs:
      timing.actionReturnAt == null || successVisibleAt == null
        ? null
        : successVisibleAt - timing.actionReturnAt,
    navigationStartToSuccessVisibleMs,
    confirmToSuccessVisibleMs,
    note: "client_action_start_is_formAction_dispatch_not_server_start",
  });
}
