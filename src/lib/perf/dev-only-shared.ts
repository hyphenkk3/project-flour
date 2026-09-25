/**
 * DEV-only performance instrumentation shared guards.
 * Production Whitebird must never emit these diagnostics.
 */

/** project-flour-dev Supabase ref. Public URL already used by DEV-only scripts. */
const DEV_SUPABASE_REF = "tzwtpxdcggesgjaqxkqr";

export const PERF_CORRELATION_PATTERN = /^p[a-f0-9]{10}$/;

export function isDevPerfEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (process.env.VERCEL_ENV === "preview") return true;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return supabaseUrl.includes(DEV_SUPABASE_REF);
}

export function createPerfCorrelationId(): string {
  const raw =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(16)}00000000`;
  return `p${raw.slice(0, 10)}`;
}

export function acceptPerfCorrelationId(value: string): string {
  const trimmed = value.trim();
  return PERF_CORRELATION_PATTERN.test(trimmed)
    ? trimmed
    : createPerfCorrelationId();
}

export function formatPerfLine(
  scope: string,
  parts: Array<string | null | undefined>,
): string {
  return `[PERF][${scope}] ${parts.filter(Boolean).join(" ")}`;
}

export type CheckoutServerPerfStep = {
  name: string;
  ms: number;
};

export type CheckoutServerPerf = {
  correlationId: string;
  totalServerMs: number;
  steps: CheckoutServerPerfStep[];
};

export function attachCheckoutServerPerf<T extends object>(
  state: T,
  perf: CheckoutServerPerf | undefined,
  enabled: boolean,
): T {
  if (!enabled || !perf) return state;
  return { ...state, perf };
}
