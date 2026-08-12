"use client";

/**
 * M4-P3 Slice 2A — explicit Owner opt-in for historical M4-P2 Delivery finance.
 * Viewing alone must never initialize fees.
 */

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormError } from "@/components/ui/form";
import { CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT } from "@/engines/orders/delivery-finance";
import { shouldShowEnableDeliveryCharges } from "@/engines/orders/delivery-finance";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import { initGuestOrderDeliveryFinanceAction } from "@/workspaces/owner/orders/actions";
import { isGuestOrderEditable } from "@/workspaces/owner/orders/labels";
import type { StorefrontOrder } from "@/types/storefront";

type EnableDeliveryChargesControlProps = {
  order: StorefrontOrder;
};

export function EnableDeliveryChargesControl({
  order,
}: EnableDeliveryChargesControlProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (
    !shouldShowEnableDeliveryCharges(order) ||
    !isGuestOrderEditable(order.status)
  ) {
    return null;
  }

  const processingDefault = formatRm(CURRENT_DELIVERY_PROCESSING_FEE_DEFAULT);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await initGuestOrderDeliveryFinanceAction(order.id);
        if (result.error) {
          setError(result.error);
          return;
        }
        // Action already revalidatePath's — avoid refresh-inside-transition hang.
        setOpen(false);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Something went wrong. Please try again.",
        );
      }
    });
  }

  return (
    <div className="space-y-2">
      <FormError message={error} />
      <button
        className="text-signal text-sm font-medium disabled:opacity-60"
        disabled={pending}
        onClick={() => setOpen(true)}
        type="button"
      >
        Enable Delivery Charges
      </button>
      <ConfirmDialog
        confirmLabel="Enable Delivery Charges"
        description={`This will enable Delivery financial charges for this existing order and add the current ${processingDefault} Processing Fee. The Delivery Fee will still need to be set separately.`}
        onCancel={() => {
          if (pending) return;
          setOpen(false);
        }}
        onConfirm={handleConfirm}
        open={open}
        pending={pending}
        title="Enable Delivery Charges?"
      />
    </div>
  );
}
