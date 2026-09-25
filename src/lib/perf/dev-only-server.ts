import { AsyncLocalStorage } from "node:async_hooks";
import {
  createPerfCorrelationId,
  formatPerfLine,
  isDevPerfEnabled,
} from "@/lib/perf/dev-only-shared";

export {
  acceptPerfCorrelationId,
  createPerfCorrelationId,
  isDevPerfEnabled,
} from "@/lib/perf/dev-only-shared";

export type PerfScope =
  | "CHECKOUT_SUBMIT"
  | "CHECKOUT_VOUCHER"
  | "CHECKOUT_RECEIPT"
  | "CHECKOUT_SUCCESS"
  | "EXTRA_SUBMIT";

type PerfStore = {
  correlationId: string;
  source?: string;
};

const perfStore = new AsyncLocalStorage<PerfStore>();

export function getPerfContext(): PerfStore | null {
  return perfStore.getStore() ?? null;
}

export function runWithPerfContext<T>(
  store: PerfStore,
  fn: () => T,
): T {
  return perfStore.run(store, fn);
}

export function logPerf(
  scope: PerfScope,
  step: string,
  elapsedMs: number,
  extra: Record<string, string | number | boolean | null | undefined> = {},
): void {
  if (!isDevPerfEnabled()) return;
  const ctx = getPerfContext();
  const correlationId =
    ctx?.correlationId ??
    (typeof extra.correlationId === "string"
      ? extra.correlationId
      : createPerfCorrelationId());
  const fields = [
    `correlationId=${correlationId}`,
    `step=${step}`,
    `elapsedMs=${Math.round(elapsedMs)}`,
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
