import { getGuestPreorderReceipt } from "@/workspaces/storefront/checkout/receipt";
import {
  createPerfCorrelationId,
  getPerfContext,
  logPerf,
  runWithPerfContext,
  snapshotDevCheckoutPerf,
  type CheckoutServerPerf,
} from "@/lib/perf/dev-only-server";

export type SuccessPageLoadResult = {
  receipt: Awaited<ReturnType<typeof getGuestPreorderReceipt>>;
  perf?: CheckoutServerPerf;
};

export async function loadSuccessPageReceipt(
  orderId?: string,
  loadReceipt: typeof getGuestPreorderReceipt = getGuestPreorderReceipt,
): Promise<SuccessPageLoadResult> {
  const correlationId = createPerfCorrelationId();
  const serverRequestAt = Date.now();
  const pageStarted = performance.now();
  return runWithPerfContext(
    { correlationId, source: "success_page", serverRequestAt },
    async () => {
      logPerf("CHECKOUT_SUCCESS", "page_start", 0);
      const receiptStarted = performance.now();
      const loaded = orderId ? await loadReceipt(orderId) : null;
      const receiptMs = performance.now() - receiptStarted;
      logPerf("CHECKOUT_SUCCESS", "receipt_loading", receiptMs, {
        hasOrderId: Boolean(orderId),
      });
      const pageMs = performance.now() - pageStarted;
      logPerf("CHECKOUT_SUCCESS", "page_data_ready", pageMs);
      const ctx = getPerfContext();
      if (ctx) {
        ctx.serverReceiptDataMs = Math.round(receiptMs);
        ctx.serverRenderMs = Math.round(pageMs - receiptMs);
      }
      logPerf("CHECKOUT_SUCCESS", "TOTAL", pageMs);
      return {
        receipt: loaded,
        perf: snapshotDevCheckoutPerf(pageMs),
      };
    },
  );
}
