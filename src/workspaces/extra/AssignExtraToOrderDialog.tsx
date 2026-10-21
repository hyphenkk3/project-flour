"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField, FormInput } from "@/components/ui/form";
import { formatBusinessCalendarDate } from "@/lib/dates";
import {
  assignExtraStockToOrderAction,
  listAssignableOrdersForExtraAction,
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

type Props = {
  extra: AssignExtraToOrderTarget | null;
  open: boolean;
  /** Existing callers may supply candidates; the picker now loads bounded pages. */
  candidateOrders?: readonly AssignExtraCandidateOrder[];
  onClose: () => void;
  onAssigned?: () => void;
};

function methodLabel(method: string): string {
  return method === "dine_in"
    ? "Dine-in"
    : method === "delivery"
      ? "Delivery"
      : "Pickup";
}

export function AssignExtraToOrderDialog({
  extra,
  open,
  onClose,
  onAssigned,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [older, setOlder] = useState(false);
  const [matchingOnly, setMatchingOnly] = useState(true);
  const [page, setPage] = useState(0);
  const [orders, setOrders] = useState<ExtraAssignableOrder[]>([]);
  const [selected, setSelected] = useState<ExtraAssignableOrder | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestId = useRef(0);
  const submitting = useRef(false);
  const stockId = extra?.id;

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setOlder(false);
    setMatchingOnly(true);
    setPage(0);
    setSelected(null);
    setOrders([]);
    setError(null);
  }, [open, stockId]);

  useEffect(() => {
    if (!open || !stockId) return;
    const id = ++requestId.current;
    setLoading(true);
    const timer = window.setTimeout(
      async () => {
        try {
          const response = await listAssignableOrdersForExtraAction({
            extraStockId: stockId,
            search,
            older,
            matchingOnly,
            page,
          });
          if (id !== requestId.current) return;
          setOrders(response.result?.orders ?? []);
          setHasMore(response.result?.hasMore ?? false);
          setError(response.error);
        } catch {
          if (id !== requestId.current) return;
          setOrders([]);
          setHasMore(false);
          setError("Could not load orders. Try again.");
        } finally {
          if (id === requestId.current) setLoading(false);
        }
      },
      search ? 250 : 0,
    );
    return () => {
      ++requestId.current;
      window.clearTimeout(timer);
    };
  }, [open, stockId, search, older, matchingOnly, page, refreshVersion]);

  function runAssign() {
    if (!stockId || pending || submitting.current) return;
    if (!selected) {
      setError("Select the intended order before assigning this Fresh Pick.");
      return;
    }
    setError(null);
    submitting.current = true;
    startTransition(async () => {
      try {
        const result = await assignExtraStockToOrderAction({
          extraStockId: stockId,
          orderId: selected.id,
        });
        if (result.error) {
          setError(result.error);
          setSelected(null);
          setRefreshVersion((value) => value + 1);
          return;
        }
        onAssigned?.();
        onClose();
      } catch {
        setSelected(null);
        setRefreshVersion((value) => value + 1);
        setError(
          "Could not assign this Fresh Pick. Please refresh the order list and try again.",
        );
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <ConfirmDialog
      allowDismiss={!pending}
      confirmLabel="Assign Fresh Pick"
      description={
        extra
          ? `Assign ${extra.cakeName} ${extra.sizeLabel} to an existing order. Cake lines and pricing are not changed.`
          : undefined
      }
      onCancel={onClose}
      onConfirm={runAssign}
      open={open && extra != null}
      pending={pending}
      title="Assign to order"
    >
      <div className="mt-4 space-y-3">
        <FormField htmlFor="extra-assign-search" label="Search orders">
          <FormInput
            id="extra-assign-search"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
              setSelected(null);
            }}
            placeholder="Customer name or order number"
            value={search}
          />
        </FormField>
        <div aria-label="Cake match filter" className="flex gap-2 text-sm">
          <button
            className={`min-h-10 rounded-lg px-3 ${matchingOnly ? "bg-ink text-white" : "bg-mist text-ink"}`}
            onClick={() => {
              setMatchingOnly(true);
              setPage(0);
              setSelected(null);
            }}
            type="button"
          >
            Matching cake & size
          </button>
          <button
            className={`min-h-10 rounded-lg px-3 ${!matchingOnly ? "bg-ink text-white" : "bg-mist text-ink"}`}
            onClick={() => {
              setMatchingOnly(false);
              setPage(0);
              setSelected(null);
            }}
            type="button"
          >
            All orders
          </button>
        </div>
        <div aria-label="Order date range" className="flex gap-2 text-sm">
          <button
            className={`min-h-10 rounded-lg px-3 ${!older ? "bg-ink text-white" : "bg-mist text-ink"}`}
            onClick={() => {
              setOlder(false);
              setPage(0);
              setSelected(null);
            }}
            type="button"
          >
            Upcoming
          </button>
          <button
            className={`min-h-10 rounded-lg px-3 ${older ? "bg-ink text-white" : "bg-mist text-ink"}`}
            onClick={() => {
              setOlder(true);
              setPage(0);
              setSelected(null);
            }}
            type="button"
          >
            Older orders
          </button>
        </div>
        <div
          aria-busy={loading}
          aria-live="polite"
          className="border-fog max-h-[min(38dvh,19rem)] space-y-2 overflow-y-auto rounded-xl border p-2"
        >
          {loading ? (
            <p className="text-skyline p-2 text-sm">Loading orders…</p>
          ) : null}
          {!loading && !error && orders.length === 0 ? (
            <p className="text-skyline p-2 text-sm">
              {matchingOnly
                ? "No matching eligible orders found. Try another name, number or date range."
                : "No orders found. Try another name, number or date range."}
            </p>
          ) : null}
          {!loading
            ? orders.map((order) => (
                <button
                  aria-pressed={selected?.id === order.id}
                  aria-describedby={
                    order.unavailableReason
                      ? `assign-order-reason-${order.id}`
                      : undefined
                  }
                  className={`w-full rounded-lg border p-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${selected?.id === order.id ? "border-ink bg-mist" : "border-fog bg-white hover:bg-mist"}`}
                  disabled={!order.canAssign}
                  key={order.id}
                  onClick={() => {
                    setSelected(order);
                    setError(null);
                  }}
                  type="button"
                >
                  <span className="text-ink block font-semibold">
                    {order.guestName} · {order.orderNumber}
                  </span>
                  <span className="text-skyline mt-1 block">
                    {formatBusinessCalendarDate(order.pickupDate)} ·{" "}
                    {methodLabel(order.fulfilmentMethod)} · {order.status}
                  </span>
                  <span className="text-ink mt-1 block">
                    {order.itemSummary}
                  </span>
                  <span
                    className={`mt-1 block text-xs ${order.canAssign ? "text-status-success" : "text-status-danger"}`}
                    id={
                      order.unavailableReason
                        ? `assign-order-reason-${order.id}`
                        : undefined
                    }
                  >
                    {order.canAssign
                      ? "Eligible · matching cake and size"
                      : order.unavailableReason ?? "This order cannot be assigned."}
                  </span>
                </button>
              ))
            : null}
        </div>
        <div className="flex items-center justify-between text-sm">
          <button
            className="text-signal min-h-10 disabled:opacity-40"
            disabled={loading || page === 0}
            onClick={() => {
              setPage(page - 1);
              setSelected(null);
            }}
            type="button"
          >
            Previous
          </button>
          <span className="text-skyline">Page {page + 1}</span>
          <button
            className="text-signal min-h-10 disabled:opacity-40"
            disabled={loading || !hasMore}
            onClick={() => {
              setPage(page + 1);
              setSelected(null);
            }}
            type="button"
          >
            Next
          </button>
        </div>
        {selected ? (
          <p className="border-fog bg-mist rounded-lg border p-3 text-sm">
            <strong>Selected:</strong> {selected.guestName} ·{" "}
            {selected.orderNumber}
          </p>
        ) : null}
        {error ? (
          <p className="text-status-danger text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </ConfirmDialog>
  );
}
