"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField, FormInput } from "@/components/ui/form";
import type { GuestOrderWorkspaceCapabilities } from "@/engines/orders/delivery-finance-capabilities";
import { isGuestOrderCancelled } from "@/engines/orders/lifecycle";
import type { StorefrontOrder } from "@/types/storefront";
import {
  cancelGuestOrderAction,
  duplicateGuestOrderAction,
} from "@/workspaces/owner/orders/actions";

type OrderLifecycleActionsProps = {
  order: StorefrontOrder;
  capabilities: GuestOrderWorkspaceCapabilities;
};

export function OrderLifecycleActions({
  order,
  capabilities,
}: OrderLifecycleActionsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"cancel" | "duplicate" | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [pickupDate, setPickupDate] = useState(order.pickupDate);

  const canCancel =
    capabilities.canCancelGuestOrder && !isGuestOrderCancelled(order.status);
  const canDuplicate = capabilities.canDuplicateGuestOrder;

  if (!canCancel && !canDuplicate) {
    return null;
  }

  async function runCancel() {
    if (pending) return;
    setError(null);
    setPending("cancel");
    try {
      const result = await cancelGuestOrderAction(order.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setCancelOpen(false);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function runDuplicate() {
    if (pending) return;
    setError(null);
    setPending("duplicate");
    try {
      const formData = new FormData();
      formData.set("pickup_date", pickupDate);
      formData.set("pickup_time", order.pickupTime);
      const result = await duplicateGuestOrderAction(order.id, formData);
      if (result?.error) {
        setError(result.error);
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canDuplicate ? (
          <button
            className="border-fog text-ink hover:bg-mist inline-flex min-h-11 items-center justify-center rounded-xl border bg-white px-4 text-sm font-medium"
            onClick={() => {
              setError(null);
              setPickupDate(order.pickupDate);
              setDuplicateOpen(true);
            }}
            type="button"
          >
            Duplicate order
          </button>
        ) : null}
        {canCancel ? (
          <button
            className="border-status-danger/40 text-status-danger hover:bg-status-danger-soft inline-flex min-h-11 items-center justify-center rounded-xl border bg-white px-4 text-sm font-medium"
            onClick={() => {
              setError(null);
              setCancelOpen(true);
            }}
            type="button"
          >
            Cancel order
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="text-status-danger text-sm">{error}</p>
      ) : null}

      <ConfirmDialog
        cancelLabel="Keep order"
        confirmLabel="Cancel order"
        description="The order and its history are kept. It cannot resume the normal lifecycle."
        onCancel={() => setCancelOpen(false)}
        onConfirm={() => void runCancel()}
        open={cancelOpen}
        pending={pending === "cancel"}
        title="Cancel this order?"
        tone="danger"
      />

      <ConfirmDialog
        cancelLabel="Back"
        confirmLabel="Create duplicate"
        description="Creates a new unpaid order with current prices. Payment and lifecycle are not copied."
        onCancel={() => setDuplicateOpen(false)}
        onConfirm={() => void runDuplicate()}
        open={duplicateOpen}
        pending={pending === "duplicate"}
        title="Duplicate this order?"
      >
        <FormField
          help="If this date is no longer valid, choose another before creating."
          htmlFor="duplicate-pickup-date"
          label="Collection date"
        >
          <FormInput
            id="duplicate-pickup-date"
            onChange={(event) => setPickupDate(event.target.value)}
            type="date"
            value={pickupDate}
          />
        </FormField>
      </ConfirmDialog>
    </div>
  );
}
