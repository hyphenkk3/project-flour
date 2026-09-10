"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { GuestPreorderReceipt } from "@/workspaces/storefront/checkout/receipt";
import {
  buildOrderDetailsCardModel,
  ensureStorefrontCanvasFonts,
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    void ensureStorefrontCanvasFonts();
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function closePreview() {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  async function handleSave() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await ensureStorefrontCanvasFonts();
      const model = buildOrderDetailsCardModel(receipt);
      const blob = renderOrderDetailsPng(model);
      const result = await shareOrDownloadOrderDetailsImage({
        blob,
        fileName: orderDetailsFileName(receipt.orderNumber),
        title: "Whitebird order details",
      });
      if (result.action === "preview" && result.objectUrl) {
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return result.objectUrl ?? null;
        });
      }
    } catch {
      setError("Could not save order details. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        className="border-fog text-ink hover:border-ink relative z-10 inline-flex min-h-12 w-full items-center justify-center rounded-lg border bg-white px-5 text-sm font-medium touch-manipulation transition-colors disabled:opacity-60 sm:w-auto"
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
      {previewUrl
        ? createPortal(
            <div
              aria-labelledby="order-details-preview-title"
              aria-modal="true"
              className="bg-ink/80 fixed inset-0 z-[80] flex flex-col items-center justify-center px-4 py-6"
              role="dialog"
            >
              <p
                className="text-paper text-center text-sm"
                id="order-details-preview-title"
              >
                Press and hold the image to save it.
              </p>
              <img
                alt="Order details"
                className="mt-4 max-h-[min(72vh,1800px)] w-auto max-w-full"
                src={previewUrl}
              />
              <button
                className="border-fog mt-5 inline-flex min-h-12 items-center justify-center rounded-lg border bg-white px-5 text-sm font-medium touch-manipulation"
                onClick={closePreview}
                type="button"
              >
                Done
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
