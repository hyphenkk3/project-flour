"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  getEffectiveAdjustments,
  RM10_CARD_CODE,
} from "@/engines/orders/promotions";
import { buildQuickViewFulfilmentSummary } from "@/engines/orders/fulfilment";
import { formatLongBusinessDate } from "@/lib/dates";
import type { StorefrontOrder } from "@/types/storefront";
import { getCalendarQuickViewOrderAction } from "@/workspaces/owner/calendar/actions";
import { captureCalendarReturnPosition } from "@/workspaces/owner/calendar/calendar-return-position";
import { buildQuickViewPaidAddonBlocks } from "@/workspaces/owner/calendar/quick-view-paid-addons";
import { ownerOrderWorkspaceHref } from "@/workspaces/owner/navigation/return-to";
import {
  formatPickupTime,
  guestOrderDisplayName,
  guestOrderStatusBadgeClassName,
  guestOrderStatusBadgeTone,
  guestOrderStatusLabel,
} from "@/workspaces/owner/orders/labels";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import { OrderMessagesSection } from "@/workspaces/owner/orders/OrderMessagesSection";
import { OrderOperationalControls } from "@/workspaces/owner/orders/OrderOperationalControls";
import {
  ProposeExtraFromCalendarPanel,
  useProposeExtraFromCalendar,
} from "@/workspaces/owner/calendar/ProposeExtraFromCalendarDialog";
import { takeRememberedCalendarExtraProposedItem } from "@/workspaces/owner/calendar/quick-view-persistence";

type CalendarQuickViewProps = {
  orderId: string | null;
  /** Calendar path for View Order returnTo / rp=1 capture. */
  returnTo: string;
  /** Default sender for Customer Ready Message. */
  staffDisplayName: string;
  /**
   * Bumped when Calendar realtime/poll updates the open order so Quick View
   * can quietly refetch without an elaborate sync system.
   */
  refreshKey?: number;
  /** After EXTRA propose succeeds — refresh calendar EXTRA markers. */
  onExtraProposed?: () => void | Promise<void>;
  onClose: () => void;
};

export function CalendarQuickView({
  orderId,
  returnTo,
  staffDisplayName,
  refreshKey = 0,
  onExtraProposed,
  onClose,
}: CalendarQuickViewProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingFromParentRef = useRef(false);
  const titleId = useId();
  const [order, setOrder] = useState<StorefrontOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const next = await getCalendarQuickViewOrderAction(id);
      if (!next) {
        setOrder(null);
        setError("Order not found.");
        return;
      }
      setOrder(next);
    } catch (err) {
      setOrder(null);
      setError(
        err instanceof Error ? err.message : "Could not load this order.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (orderId && !dialog.open) {
      dialog.showModal();
      return;
    }

    if (!orderId && dialog.open) {
      closingFromParentRef.current = true;
      dialog.close();
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setError(null);
      setLoading(false);
      return;
    }
    void load(orderId);
  }, [orderId, refreshKey, load]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const open = orderId != null;

  return (
    <dialog
      aria-labelledby={open ? titleId : undefined}
      aria-modal="true"
      className="text-ink open:fixed open:inset-0 open:z-50 open:m-0 open:flex open:h-dvh open:max-h-dvh open:w-full open:max-w-none open:translate-x-0 open:translate-y-0 open:items-stretch open:justify-end open:overflow-hidden open:border-0 open:bg-transparent open:p-0 open:shadow-none backdrop:bg-ink/40"
      onCancel={(event) => {
        event.preventDefault();
        handleClose();
      }}
      onClick={(event) => {
        // Dimmed area is the transparent dialog itself (outside the sheet).
        // Clicks inside the white sheet have a descendant target and must not close.
        if (event.target === dialogRef.current) {
          handleClose();
        }
      }}
      onClose={() => {
        if (closingFromParentRef.current) {
          closingFromParentRef.current = false;
          return;
        }
        handleClose();
      }}
      ref={dialogRef}
    >
      {open ? (
        <div
          className="border-line flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden border-y-0 border-r-0 border-l bg-white shadow-xl sm:ml-auto sm:w-full sm:max-w-md"
          // Keep sheet interactions from bubbling as dialog self-clicks.
          onClick={(event) => event.stopPropagation()}
        >
          <header className="border-line flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
            <div className="min-w-0 space-y-1">
              <p className="text-skyline text-[11px] font-semibold tracking-wide uppercase">
                Quick View
              </p>
              <h2
                className="text-ink truncate text-lg font-semibold"
                id={titleId}
              >
                {order
                  ? guestOrderDisplayName({
                      customerName: order.customerName,
                      orderSource: order.orderSource,
                      crewOrder: order.crewOrder,
                    })
                  : loading
                    ? "Loading…"
                    : "Order"}
              </h2>
            </div>
            <button
              aria-label="Close Quick View"
              className="text-skyline hover:bg-mist hover:text-ink inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl leading-none"
              onClick={handleClose}
              type="button"
            >
              ×
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {loading && !order ? (
              <p className="text-skyline text-sm">Loading order…</p>
            ) : null}

            {error && !order ? (
              <div className="space-y-3">
                <p className="text-status-danger text-sm">{error}</p>
                <button
                  className="border-line text-ink hover:bg-mist inline-flex min-h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium"
                  onClick={() => {
                    if (orderId) void load(orderId);
                  }}
                  type="button"
                >
                  Retry
                </button>
              </div>
            ) : null}

            {order ? (
              <CalendarQuickViewBody
                loading={loading}
                onExtraProposed={onExtraProposed}
                onRefresh={() => {
                  if (orderId) return load(orderId);
                }}
                order={order}
                staffDisplayName={staffDisplayName}
              />
            ) : null}
          </div>

          {order ? (
            <footer className="border-line shrink-0 border-t px-4 py-3 sm:px-5">
              <Link
                className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 w-full items-center justify-center rounded-lg px-5 text-sm font-medium"
                href={ownerOrderWorkspaceHref(order.id, returnTo)}
                onClick={() => captureCalendarReturnPosition(returnTo)}
              >
                View Order
              </Link>
            </footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

function CalendarQuickViewBody({
  order,
  loading,
  onRefresh,
  onExtraProposed,
  staffDisplayName,
}: {
  order: StorefrontOrder;
  loading: boolean;
  onRefresh: () => void | Promise<void>;
  onExtraProposed?: () => void | Promise<void>;
  staffDisplayName: string;
}) {
  const settlement = order.settlement;
  const effectiveAdjustments = getEffectiveAdjustments(order.adjustments);
  const phone = order.phone.trim();
  const complimentary = [...order.complimentaryItems].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
  const paidAddonBlocks = buildQuickViewPaidAddonBlocks(order.paidAddons);
  const fulfilment = buildQuickViewFulfilmentSummary(order);
  const proposeExtra = useProposeExtraFromCalendar({
    onProposed: onExtraProposed,
  });

  useEffect(() => {
    const remembered = takeRememberedCalendarExtraProposedItem();
    if (remembered) {
      proposeExtra.seedSuccessItemId(remembered);
    }
    // Seed once when this order body mounts after a propose remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  return (
    <div className={["space-y-5", loading ? "opacity-70" : ""].join(" ")}>
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            className={guestOrderStatusBadgeClassName(order.status)}
            label={guestOrderStatusLabel(order.status)}
            tone={guestOrderStatusBadgeTone(order.status)}
          />
          <span className="text-skyline text-sm">{order.orderNumber}</span>
        </div>
        <div className="text-ink space-y-1 text-sm">
          <p>
            <span className="text-skyline">{fulfilment.methodLabel} </span>
            {formatLongBusinessDate(order.pickupDate)}
            {" · "}
            {formatPickupTime(order.pickupTime)}
          </p>
          {fulfilment.isDelivery ? (
            <div className="space-y-0.5">
              {fulfilment.recipientName ? (
                <p>
                  <span className="text-skyline">Recipient </span>
                  {fulfilment.recipientName}
                </p>
              ) : null}
              {fulfilment.recipientPhone ? (
                <p>
                  <span className="text-skyline">Phone </span>
                  {fulfilment.recipientPhone}
                </p>
              ) : null}
              {fulfilment.addressLines.length > 0 ? (
                <div>
                  <p className="text-skyline">Address</p>
                  {fulfilment.addressLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              ) : null}
              {fulfilment.notifyLabel ? (
                <p>
                  <span className="text-skyline">Notify </span>
                  {fulfilment.notifyLabel}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <OrderOperationalControls
        deliveredAt={order.deliveredAt}
        fulfilmentMethod={order.fulfilmentMethod}
        onSuccess={onRefresh}
        orderId={order.id}
        outForDeliveryAt={order.outForDeliveryAt}
        pickedUpAt={order.pickedUpAt}
        readyAt={order.readyAt}
      />

      <OrderMessagesSection order={order} staffDisplayName={staffDisplayName} />

      <section className="space-y-1">
        <h3 className="text-skyline text-[11px] font-semibold tracking-wide uppercase">
          Customer
        </h3>
        {phone ? (
          <p className="text-ink text-sm">{phone}</p>
        ) : (
          <p className="text-skyline text-sm">No phone number</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-skyline text-[11px] font-semibold tracking-wide uppercase">
          Cakes
        </h3>
        <ul className="space-y-3">
          {order.items.map((item) => (
            <li className="text-ink text-sm" key={item.id}>
              <p className="font-medium">{item.cakeName}</p>
              <p className="text-skyline">
                {item.sizeLabel} ×{item.quantity}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {proposeExtra.target?.item.id === item.id ? null : (
                  <button
                    className="border-line text-ink hover:bg-mist inline-flex min-h-9 items-center justify-center rounded-lg border px-3 text-xs font-medium"
                    onClick={() =>
                      proposeExtra.openForItem(
                        order.id,
                        item,
                        order.pickupDate,
                      )
                    }
                    type="button"
                  >
                    Propose EXTRA
                  </button>
                )}
                {proposeExtra.successItemId === item.id ? (
                  <p className="text-status-success text-xs font-medium">
                    EXTRA proposed
                  </p>
                ) : null}
              </div>
              {proposeExtra.target?.item.id === item.id ? (
                <ProposeExtraFromCalendarPanel
                  error={proposeExtra.error}
                  onCancel={proposeExtra.cancel}
                  onSubmit={proposeExtra.submit}
                  pending={proposeExtra.pending}
                  target={proposeExtra.target}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {paidAddonBlocks.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-skyline text-[11px] font-semibold tracking-wide uppercase">
            Add-ons
          </h3>
          <ul className="space-y-2">
            {paidAddonBlocks.map((block) => (
              <li className="text-ink text-sm" key={block.code}>
                <p className="font-medium">{block.title}</p>
                {block.messageLines.map((line) => (
                  <p className="text-skyline" key={line}>
                    {line}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {complimentary.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-skyline text-[11px] font-semibold tracking-wide uppercase">
            Complimentary / Prep
          </h3>
          <ul className="space-y-1">
            {complimentary.map((item) => (
              <li className="text-ink text-sm" key={item.id}>
                {item.name} ×{item.quantity}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {order.includeReceipt ? (
        <section>
          <p className="bg-status-info-soft text-status-info inline-flex rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide uppercase">
            Include RECEIPT
          </p>
        </section>
      ) : null}

      {order.needsBakeryAttention ? (
        <section className="border-status-warning/30 bg-status-warning-soft/40 space-y-1 rounded-lg border px-3 py-2.5">
          <h3 className="text-status-warning text-[11px] font-semibold tracking-wide uppercase">
            Bakery Attention
          </h3>
          <p className="text-ink text-sm font-medium">
            {order.bakeryAttentionNote?.trim() || "Needs bakery attention"}
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-skyline text-[11px] font-semibold tracking-wide uppercase">
          Payment
        </h3>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-skyline text-xs">Amount due</p>
            <p className="text-ink font-semibold">
              {formatRm(settlement.amountDue)}
            </p>
          </div>
          <div>
            <p className="text-skyline text-xs">Received</p>
            <p className="text-ink font-semibold">
              {formatRm(settlement.netReceived)}
            </p>
          </div>
          <div>
            <p className="text-skyline text-xs">Balance</p>
            <p className="text-ink font-semibold">
              {formatRm(settlement.remainingBalance)}
            </p>
          </div>
        </div>

        {effectiveAdjustments.length > 0 ? (
          <ul className="space-y-1">
            {effectiveAdjustments.map((adj) => (
              <li
                className="text-ink flex justify-between gap-3 text-sm"
                key={adj.id}
              >
                <span>
                  {adj.label}
                  {adj.code === RM10_CARD_CODE ? (
                    <span className="text-skyline"> · applied</span>
                  ) : null}
                </span>
                <span className="shrink-0">{formatRm(adj.amount)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
