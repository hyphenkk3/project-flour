"use client";

import { useState } from "react";
import type { GuestPreorderReceipt } from "@/workspaces/storefront/checkout/receipt";
import {
  buildOrderDetailsCardModel,
  orderDetailsFileName,
  renderOrderDetailsPng,
  shareOrDownloadOrderDetailsImage,
} from "@/workspaces/storefront/checkout/order-details-card";

type SaveOrderDetailsButtonProps = {
  receipt: GuestPreorderReceipt;
};

export function SaveOrderDetailsButton({
  receipt,
}: SaveOrderDetailsButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const model = buildOrderDetailsCardModel(receipt);
      const blob = await renderOrderDetailsPng(model);
      await shareOrDownloadOrderDetailsImage({
        blob,
        fileName: orderDetailsFileName(receipt.orderNumber),
        title: "Whitebird order details",
      });
    } catch {
      setError("Could not save order details. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        className="border-fog text-ink hover:border-ink inline-flex min-h-12 w-full items-center justify-center rounded-lg border bg-white px-5 text-sm font-medium transition-colors disabled:opacity-60 sm:w-auto"
        disabled={busy}
        onClick={() => void handleSave()}
        type="button"
      >
        {busy ? "Preparing…" : "Save Order Details"}
      </button>
      {error ? (
        <p className="text-status-danger mt-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
