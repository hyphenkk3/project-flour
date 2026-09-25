import { getGuestPreorderReceipt } from "@/workspaces/storefront/checkout/receipt";
import {
  createPerfCorrelationId,
  logPerf,
  runWithPerfContext,
} from "@/lib/perf/dev-only-server";

export async function loadSuccessPageReceipt(
  orderId?: string,
  loadReceipt: typeof getGuestPreorderReceipt = getGuestPreorderReceipt,
) {
  const correlationId = createPerfCorrelationId();
  const pageStarted = performance.now();
  return runWithPerfContext(
    { correlationId, source: "success_page" },
    async () => {
      logPerf("CHECKOUT_SUCCESS", "page_start", 0);
      const receiptStarted = performance.now();
      const loaded = orderId ? await loadReceipt(orderId) : null;
      logPerf(
        "CHECKOUT_SUCCESS",
        "receipt_loading",
        performance.now() - receiptStarted,
        { hasOrderId: Boolean(orderId) },
      );
      logPerf(
        "CHECKOUT_SUCCESS",
        "page_data_ready",
        performance.now() - pageStarted,
      );
      logPerf("CHECKOUT_SUCCESS", "TOTAL", performance.now() - pageStarted);
      return loaded;
    },
  );
}
