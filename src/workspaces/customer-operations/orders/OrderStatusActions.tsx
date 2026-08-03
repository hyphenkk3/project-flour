"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import type { OrderDetail } from "@/types/order";
import {
  cancelOrderAction,
  confirmOrderAction,
  markOrderAwaitingPaymentAction,
  markOrderPendingConfirmationAction,
  recordOrderPaidAction,
} from "@/workspaces/customer-operations/orders/actions";

type OrderStatusActionsProps = {
  order: OrderDetail;
};

type PendingAction = "confirm" | "cancel" | null;

export function OrderStatusActions({ order }: OrderStatusActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  const canPending = order.status === "submitted";
  const canConfirm =
    order.status === "submitted" || order.status === "pending_confirmation";
  const canAwaitingPayment = order.status === "confirmed";
  const canRecordPaid =
    (order.status === "confirmed" || order.status === "awaiting_payment") &&
    order.paymentStatus !== "paid";
  const canCancel =
    order.status !== "cancelled" && order.status !== "completed";

  function runAction(
    action: () => Promise<{ error: string | null }>,
    successTitle: string,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        toast({ title: result.error, tone: "danger" });
        return;
      }
      setDialog(null);
      toast({ title: successTitle, tone: "success" });
      router.refresh();
    });
  }

  if (
    !canPending &&
    !canConfirm &&
    !canAwaitingPayment &&
    !canRecordPaid &&
    !canCancel
  ) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {canPending ? (
          <button
            className="border-fog text-ink inline-flex min-h-11 items-center justify-center rounded-lg border bg-white px-4 text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={() =>
              runAction(
                () => markOrderPendingConfirmationAction(order.id),
                "Marked pending confirmation",
              )
            }
            type="button"
          >
            Mark pending confirmation
          </button>
        ) : null}

        {canConfirm ? (
          <button
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={() => setDialog("confirm")}
            type="button"
          >
            Confirm order
          </button>
        ) : null}

        {canAwaitingPayment ? (
          <button
            className="border-fog text-ink inline-flex min-h-11 items-center justify-center rounded-lg border bg-white px-4 text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={() =>
              runAction(
                () => markOrderAwaitingPaymentAction(order.id),
                "Marked awaiting payment",
              )
            }
            type="button"
          >
            Mark awaiting payment
          </button>
        ) : null}

        {canRecordPaid ? (
          <button
            className="bg-status-success inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium text-white disabled:opacity-60"
            disabled={pending}
            onClick={() =>
              runAction(
                () => recordOrderPaidAction(order.id),
                "Payment recorded as paid",
              )
            }
            type="button"
          >
            Record payment paid
          </button>
        ) : null}

        {canCancel ? (
          <button
            className="text-status-danger inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:opacity-60"
            disabled={pending}
            onClick={() => setDialog("cancel")}
            type="button"
          >
            Cancel order
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        confirmLabel="Confirm order"
        description={`Confirm ${order.orderNumber} for ${order.customer.fullName}?`}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          runAction(() => confirmOrderAction(order.id), "Order confirmed")
        }
        open={dialog === "confirm"}
        pending={pending}
        title="Confirm order"
      />

      <ConfirmDialog
        confirmLabel="Cancel order"
        description={`Cancel ${order.orderNumber}? This cannot be undone in this version.`}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          runAction(() => cancelOrderAction(order.id), "Order cancelled")
        }
        open={dialog === "cancel"}
        pending={pending}
        title="Cancel order"
        tone="danger"
      />
    </div>
  );
}
