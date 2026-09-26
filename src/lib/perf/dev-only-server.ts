import { AsyncLocalStorage } from "node:async_hooks";
import {
  attachCheckoutServerPerf,
  createPerfCorrelationId,
  formatPerfLine,
  isDevPerfEnabled,
  type CheckoutServerPerf,
  type CheckoutServerPerfStep,
} from "@/lib/perf/dev-only-shared";

export {
  acceptPerfCorrelationId,
  attachCheckoutServerPerf,
  createPerfCorrelationId,
  isDevPerfEnabled,
} from "@/lib/perf/dev-only-shared";
export type { CheckoutServerPerf, CheckoutServerPerfStep } from "@/lib/perf/dev-only-shared";

export type PerfScope =
  | "CHECKOUT_SUBMIT"
  | "CHECKOUT_DATE"
  | "CHECKOUT_VOUCHER"
  | "CHECKOUT_RECEIPT"
  | "CHECKOUT_SUCCESS"
  | "EXTRA_SUBMIT";

type PerfStore = {
  correlationId: string;
  source?: string;
  steps: CheckoutServerPerfStep[];
  serverRequestAt?: number;
  serverReceiptDataMs?: number;
  serverRenderMs?: number;
};

const perfStore = new AsyncLocalStorage<PerfStore>();

export function getPerfContext(): PerfStore | null {
  return perfStore.getStore() ?? null;
}

export function runWithPerfContext<T>(
  store: Omit<PerfStore, "steps"> & { steps?: CheckoutServerPerfStep[] },
  fn: () => T,
): T {
  return perfStore.run(
    {
      correlationId: store.correlationId,
      source: store.source,
      steps: store.steps ?? [],
      serverRequestAt: store.serverRequestAt,
      serverReceiptDataMs: store.serverReceiptDataMs,
      serverRenderMs: store.serverRenderMs,
    },
    fn,
  );
}

const UNCOLLECTED_STEPS = new Set(["TOTAL", "action_start", "action_return"]);

export function snapshotDevCheckoutPerf(
  totalServerMs: number,
): CheckoutServerPerf | undefined {
  if (!isDevPerfEnabled()) return undefined;
  const ctx = getPerfContext();
  if (!ctx) return undefined;
  return {
    correlationId: ctx.correlationId,
    totalServerMs: Math.round(totalServerMs),
    steps: ctx.steps.map((step) => ({
      name: step.name,
      ms: Math.round(step.ms),
    })),
    serverRequestAt: ctx.serverRequestAt,
    serverReceiptDataMs: ctx.serverReceiptDataMs,
    serverRenderMs: ctx.serverRenderMs,
  };
}

export function withDevCheckoutPerf<T extends object>(
  state: T,
  totalServerMs: number,
): T {
  return attachCheckoutServerPerf(
    state,
    snapshotDevCheckoutPerf(totalServerMs),
    isDevPerfEnabled(),
  );
}

export function logPerf(
  scope: PerfScope,
  step: string,
  elapsedMs: number,
  extra: Record<string, string | number | boolean | null | undefined> = {},
): void {
  if (!isDevPerfEnabled()) return;
  const ctx = getPerfContext();
  const roundedMs = Math.round(elapsedMs);
  if (
    ctx &&
    extra.skipped !== true &&
    roundedMs > 0 &&
    !UNCOLLECTED_STEPS.has(step)
  ) {
    ctx.steps.push({ name: step, ms: roundedMs });
  }
  const correlationId =
    ctx?.correlationId ??
    (typeof extra.correlationId === "string"
      ? extra.correlationId
      : createPerfCorrelationId());
  const fields = [
    `correlationId=${correlationId}`,
    `step=${step}`,
    `elapsedMs=${roundedMs}`,
    ctx?.source ? `source=${ctx.source}` : null,
    ...Object.entries(extra)
      .filter(([key]) => key !== "correlationId")
      .map(([key, value]) =>
        value == null ? null : `${key}=${String(value)}`,
      ),
  ];
  console.info(formatPerfLine(scope, fields));
}

export function logPerfSkipped(
  scope: PerfScope,
  step: string,
  extra: Record<string, string | number | boolean | null | undefined> = {},
): void {
  logPerf(scope, step, 0, { skipped: true, ...extra });
}
