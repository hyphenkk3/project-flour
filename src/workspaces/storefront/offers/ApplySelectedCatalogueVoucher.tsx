"use client";

import { useEffect, useState } from "react";
import { applyGuestCatalogueVoucherAction } from "@/workspaces/vouchers/catalogue-actions";
import { logCheckoutClient } from "@/lib/perf/dev-only-client";
import {
  readSelectedCatalogueVoucherId,
  writeSelectedCatalogueVoucherId,
} from "@/workspaces/storefront/offers/catalogue-voucher-selection";

export function ApplySelectedCatalogueVoucher({
  orderId,
}: {
  orderId?: string;
}) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    const voucherId = readSelectedCatalogueVoucherId();
    if (!voucherId) return;
    let cancelled = false;
    logCheckoutClient("CHECKOUT_CLIENT", {
      step: "success_retry_apply_start",
      note: "ApplySelectedCatalogueVoucher_client_effect",
    });
    void applyGuestCatalogueVoucherAction(orderId, voucherId).then((result) => {
      if (cancelled) return;
      writeSelectedCatalogueVoucherId(null);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setMessage("Catalogue voucher applied to this order.");
    });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!message) return null;
  return (
    <p className="text-skyline mt-4 text-center text-sm" role="status">
      {message}
    </p>
  );
}
