"use client";

import { useEffect, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField, FormInput } from "@/components/ui/form";
import { formatBusinessCalendarDate } from "@/lib/dates";
import { formatExtraPickupThroughClock } from "@/engines/extra/fresh-picks-time";
import {
  assignExtraStockToOrderAction,
  findAssignableOrderForExtraAction,
} from "@/workspaces/extra/actions";
import type { ExtraAssignableOrder } from "@/workspaces/extra/queries";

export type AssignExtraToOrderTarget = {
  id: string;
  cakeName: string;
  sizeLabel: string;
};

export type AssignExtraCandidateOrder = {
  id: string;
  customerName: string;
  pickupDate: string;
  pickupTime: string;
};

type AssignExtraToOrderDialogProps = {
  extra: AssignExtraToOrderTarget | null;
  open: boolean;
  candidateOrders?: readonly AssignExtraCandidateOrder[];
  onClose: () => void;
  onAssigned?: () => void;
};

function formatCandidatePickup(order: AssignExtraCandidateOrder): string {
  const dateLabel = formatBusinessCalendarDate(order.pickupDate);
  const iso = `${order.pickupDate}T${order.pickupTime.length === 5 ? `${order.pickupTime}:00` : order.pickupTime}+08:00`;
  const clock = formatExtraPickupThroughClock(iso);
  return clock === "—" ? dateLabel : `${dateLabel} · ${clock}`;
}

export function AssignExtraToOrderDialog({
  extra,
  open,
  candidateOrders = [],
  onClose,
  onAssigned,
}: AssignExtraToOrderDialogProps) {
  const [pending, startTransition] = useTransition();
  const [assignQuery, setAssignQuery] = useState("");
  const [foundOrder, setFoundOrder] = useState<ExtraAssignableOrder | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAssignQuery("");
    setFoundOrder(null);
    setError(null);
  }, [open, extra?.id]);

  const filteredCandidates = candidateOrders.filter((order) => {
    const needle = assignQuery.trim().toLowerCase();
    if (!needle) return true;
    return (
      order.customerName.toLowerCase().includes(needle) ||
      order.pickupDate.includes(needle)
    );
  });

  function searchAssignOrder(query = assignQuery) {
    if (!query.trim()) {
      setError("Enter an order number or select an order.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await findAssignableOrderForExtraAction(query);
      if (result.error) {
        setError(result.error);
        setFoundOrder(null);
        return;
      }
      if (!result.order) {
        setError("No matching order found.");
        setFoundOrder(null);
        return;
      }
      setFoundOrder(result.order);
    });
  }

  function runAssign() {
    if (!extra) return;
    if (!foundOrder) {
      searchAssignOrder();
      return;
    }
    if (foundOrder.extraStockId) {
      setError("That order already has a Fresh Pick assigned.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await assignExtraStockToOrderAction({
        extraStockId: extra.id,
        orderId: foundOrder.id,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onAssigned?.();
      onClose();
    });
  }

  return (
    <ConfirmDialog
      allowDismiss={!pending}
      confirmLabel="Assign Fresh Pick"
      description={
        extra
          ? `Assign ${extra.cakeName} ${extra.sizeLabel} to an existing order. This Extra will leave Fresh Picks. Cake lines on the order are not changed.`
          : undefined
      }
      onCancel={() => {
        if (pending) return;
        onClose();
      }}
      onConfirm={runAssign}
      open={open && extra != null}
      pending={pending}
      title="Assign to order"
    >
      {extra ? (
        <input name="extra_stock_id" type="hidden" value={extra.id} />
      ) : null}
      <FormField htmlFor="extra-assign-order" label="Select an existing order">
        <FormInput
          id="extra-assign-order"
          onChange={(event) => setAssignQuery(event.target.value)}
          placeholder="ORD-… or customer name"
          value={assignQuery}
        />
      </FormField>
      <button
        className="border-fog text-ink hover:bg-mist mt-3 inline-flex min-h-11 items-center justify-center rounded-xl border bg-white px-4 text-sm font-medium transition disabled:opacity-60"
        disabled={pending}
        onClick={() => searchAssignOrder()}
        type="button"
      >
        Find order
      </button>
      {filteredCandidates.length > 0 ? (
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
          {filteredCandidates.slice(0, 8).map((order) => (
            <li key={order.id}>
              <button
                className="border-fog hover:bg-mist w-full rounded-lg border bg-white px-3 py-2 text-left text-sm disabled:opacity-60"
                disabled={pending}
                onClick={() => searchAssignOrder(order.id)}
                type="button"
              >
                <span className="text-ink font-medium">
                  {order.customerName}
                </span>
                <span className="text-skyline mt-0.5 block text-xs">
                  {formatCandidatePickup(order)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {foundOrder ? (
        <p className="text-ink mt-3 text-sm leading-relaxed">
          {foundOrder.orderNumber} · {foundOrder.guestName} ·{" "}
          {foundOrder.pickupDate}
          {foundOrder.pickupTime ? ` · ${foundOrder.pickupTime}` : ""}
          {foundOrder.itemSummary ? ` · ${foundOrder.itemSummary}` : ""}
          {foundOrder.extraStockId ? " · already has a Fresh Pick" : ""}
        </p>
      ) : null}
      {error ? <p className="text-status-danger mt-3 text-sm">{error}</p> : null}
    </ConfirmDialog>
  );
}
