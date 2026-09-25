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

const CORRELATION_STORAGE_KEY = "wb-perf-checkout-correlation-v2";
const LEGACY_SUBMIT_STORAGE_KEY = "wb-perf-checkout-submit-v1";
const LOAD_STORAGE_KEY = "wb-perf-checkout-load-v1";

export type CheckoutSubmitTiming = {
  correlationId: string;
  flow: "preorder" | "extra";
  timeOrigin: number;
  confirmClickAt: number;
  actionDispatchAt: number | null;
  actionReturnAt: number | null;
  navigationCallAt: number | null;
};

export type ActiveSuccessNavigationPerf = {
  correlationId: string;
  navigationCallAt: number;
};

let currentAttempt: CheckoutSubmitTiming | null = null;
let activeSuccessNavigation: ActiveSuccessNavigationPerf | null = null;

function canUseBrowserTools(): boolean {
  return isDevPerfEnabled() && typeof window !== "undefined";
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

function currentTimeOrigin(): number {
  return typeof performance !== "undefined" ? performance.timeOrigin : 0;
}

/** Rejects mixed clocks, missing marks, negatives, and implausible spans. */
const MAX_CLIENT_INTERVAL_MS = 10 * 60 * 1000;

export function elapsedPerfMs(
  from: number | null | undefined,
  to: number | null | undefined,
): number | null {
  if (from == null || to == null) return null;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const ms = Math.round(to - from);
  if (!Number.isFinite(ms) || ms < 0 || ms > MAX_CLIENT_INTERVAL_MS) {
    return null;
  }
  return ms;
}

export function resetCheckoutAttemptTiming(): void {
  currentAttempt = null;
  activeSuccessNavigation = null;
}

export function startCheckoutAttemptTiming(
  correlationId: string,
  flow: "preorder" | "extra",
): CheckoutSubmitTiming {
  const started = nowMs();
  currentAttempt = {
    correlationId,
    flow,
    timeOrigin: currentTimeOrigin(),
    confirmClickAt: started,
    actionDispatchAt: started,
    actionReturnAt: null,
    navigationCallAt: null,
  };
  activeSuccessNavigation = null;
  persistCheckoutCorrelation(correlationId, flow);
  return currentAttempt;
}

export function readCheckoutSubmitTiming(): CheckoutSubmitTiming | null {
  if (!currentAttempt) return null;
  if (currentAttempt.timeOrigin !== currentTimeOrigin()) {
    currentAttempt = null;
    activeSuccessNavigation = null;
    return null;
  }
  return currentAttempt;
}

export function readCheckoutCorrelationId(): string | null {
  const live = readCheckoutSubmitTiming();
  if (live?.correlationId) return live.correlationId;
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CORRELATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { correlationId?: string };
    return parsed.correlationId ?? null;
  } catch {
    return null;
  }
}

function persistCheckoutCorrelation(
  correlationId: string,
  flow: "preorder" | "extra",
): void {
  if (!canUseBrowserTools()) return;
  try {
    sessionStorage.removeItem(LEGACY_SUBMIT_STORAGE_KEY);
    sessionStorage.setItem(
      CORRELATION_STORAGE_KEY,
      JSON.stringify({ correlationId, flow }),
    );
  } catch {
    // Private mode / quota — skip persistence.
  }
}

export function markCheckoutPerf(name: string): void {
  if (!canUseBrowserTools()) return;
  try {
    performance.mark(name);
  } catch {
    // Ignore missing Performance API.
  }
}

export function markCheckoutActionReturned(): CheckoutSubmitTiming | null {
  const attempt = readCheckoutSubmitTiming();
  if (!attempt) return null;
  if (attempt.actionReturnAt == null) {
    attempt.actionReturnAt = nowMs();
  }
  return attempt;
}

export function markCheckoutNavigationCall(): CheckoutSubmitTiming | null {
  const attempt = readCheckoutSubmitTiming();
  if (!attempt) return null;
  if (attempt.navigationCallAt == null) {
    attempt.navigationCallAt = nowMs();
  }
  activeSuccessNavigation = {
    correlationId: attempt.correlationId,
    navigationCallAt: attempt.navigationCallAt,
  };
  return attempt;
}

export function readActiveSuccessNavigation(
  expectedCorrelationId: string | null | undefined,
): ActiveSuccessNavigationPerf | null {
  if (!activeSuccessNavigation || !expectedCorrelationId) return null;
  if (activeSuccessNavigation.correlationId !== expectedCorrelationId) {
    return null;
  }
  return activeSuccessNavigation;
}

export function logCheckoutClient(
  scope:
    | "CHECKOUT_CLIENT"
    | "CHECKOUT_LOAD"
    | "EXTRA_CLIENT"
    | "CHECKOUT_SERVER"
    | "CHECKOUT_SERVER_SUMMARY"
    | "CHECKOUT_SUCCESS_SERVER"
    | "CHECKOUT_SUCCESS_PHOTO"
    | "CHECKOUT_NAV",
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
  const sameOrigin = timing.timeOrigin === currentTimeOrigin();
  const visibleAt = sameOrigin ? successVisibleAt : null;
  const confirmToClientDispatchMs = elapsedPerfMs(
    timing.confirmClickAt,
    timing.actionDispatchAt,
  );
  logCheckoutClient(timing.flow === "extra" ? "EXTRA_CLIENT" : "CHECKOUT_CLIENT", {
    correlationId: timing.correlationId,
    confirmClickMs: 0,
    clientActionDispatchMs: confirmToClientDispatchMs,
    confirmToClientDispatchMs,
    confirmToActionReturnMs: elapsedPerfMs(
      timing.confirmClickAt,
      timing.actionReturnAt,
    ),
    actionReturnToNavigationCallMs: elapsedPerfMs(
      timing.actionReturnAt,
      timing.navigationCallAt,
    ),
    confirmToSuccessVisibleMs: elapsedPerfMs(timing.confirmClickAt, visibleAt),
    note: "same_document_performance_now_only",
  });
}
