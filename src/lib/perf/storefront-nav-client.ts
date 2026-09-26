"use client";

import {
  createPerfCorrelationId,
  elapsedPerfMs,
} from "@/lib/perf/dev-only-client";

export type StorefrontNavKind = "browse" | "cake" | "back";

export type StorefrontNavIntent = {
  correlationId: string;
  href: string;
  kind: StorefrontNavKind;
  intentAt: number;
  timeOrigin: number;
  prefetchCompletedAt: number | null;
};

let pending: StorefrontNavIntent | null = null;

function currentTimeOrigin(): number {
  return typeof performance !== "undefined" ? performance.timeOrigin : 0;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

export function markStorefrontNavIntent(
  href: string,
  kind: StorefrontNavKind,
): StorefrontNavIntent | null {
  const dest = href.trim();
  if (!dest.startsWith("/")) return null;
  pending = {
    correlationId: createPerfCorrelationId(),
    href: dest,
    kind,
    intentAt: nowMs(),
    timeOrigin: currentTimeOrigin(),
    prefetchCompletedAt: null,
  };
  return pending;
}

export function markStorefrontPrefetchComplete(href: string): void {
  if (!pending) return;
  if (pending.href !== href.trim()) return;
  if (pending.timeOrigin !== currentTimeOrigin()) return;
  if (pending.prefetchCompletedAt != null) return;
  pending.prefetchCompletedAt = nowMs();
}

export function consumeStorefrontNavIntent(input: {
  href: string;
  kinds: readonly StorefrontNavKind[];
}): {
  correlationId: string;
  kind: StorefrontNavKind;
  intentToVisibleMs: number | null;
  prefetchCompletedMs: number | null;
  prefetchReused: boolean | null;
} | null {
  const intent = pending;
  if (!intent) return null;
  if (intent.timeOrigin !== currentTimeOrigin()) {
    pending = null;
    return null;
  }
  if (!input.kinds.includes(intent.kind)) return null;
  const dest = input.href.trim();
  if (intent.href !== dest && !dest.startsWith(`${intent.href}?`)) {
    return null;
  }
  const visibleAt = nowMs();
  pending = null;
  return {
    correlationId: intent.correlationId,
    kind: intent.kind,
    intentToVisibleMs: elapsedPerfMs(intent.intentAt, visibleAt),
    prefetchCompletedMs: elapsedPerfMs(
      intent.intentAt,
      intent.prefetchCompletedAt,
    ),
    prefetchReused:
      intent.prefetchCompletedAt != null &&
      intent.prefetchCompletedAt <= visibleAt,
  };
}

export function resetStorefrontNavIntentForTests(): void {
  pending = null;
}
