"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { CakePhotoImage } from "@/components/ui/CakePhotoImage";
import { formatShortBusinessDate } from "@/lib/dates";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import { dineInVenueLabel, parseDineInVenue } from "@/engines/business-calendar/dine-in-hours";
import { workspaceFulfilmentSectionTitle } from "@/engines/orders/fulfilment";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import {
  FRESH_PICK_CART_OPEN_EVENT,
  freshPickCartCount,
  freshPickCartHasItems,
  freshPickCartTotal,
  freshPickCheckoutHref,
  readFreshPickCart,
  removeFreshPickFromCart,
  writeFreshPickCart,
  type FreshPickCart,
  type FreshPickCartItem,
} from "@/workspaces/storefront/extra/fresh-pick-cart";
import { useFreshPickCart } from "@/workspaces/storefront/extra/useFreshPickCart";
import { CatalogueVoucherCartPanel } from "@/workspaces/storefront/offers/CatalogueVoucherCartPanel";
import { CatalogueVoucherCartTotals } from "@/workspaces/storefront/offers/CatalogueVoucherCartTotals";

const DESKTOP_ORDER_RAIL_WIDTH = "20.5rem";

function pickupLabel(
  item: FreshPickCartItem,
  fulfilmentMethod: FreshPickCart["fulfilmentMethod"],
): string {
  const date = formatShortBusinessDate(item.pickupDate) || item.pickupDate;
  const time = formatPickupTime(item.pickupTime);
  return fulfilmentMethod === "dine_in"
    ? `${date} · Cake served ${time}`
    : `${date} · ${time}`;
}

function ExtraOrderLines({
  cart,
}: {
  cart: FreshPickCart;
}) {
  return (
    <ul className="divide-fog divide-y">
      {cart.items.map((item) => (
        <li className="py-5" key={item.extraStockId}>
          <div className="flex items-start gap-3">
            {item.imageUrl ? (
              <div className="bg-fog relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px]">
                <CakePhotoImage alt="" sizes="56px" src={item.imageUrl} />
              </div>
            ) : (
              <div aria-hidden className="bg-fog h-14 w-14 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-ink text-[1.05rem] leading-snug tracking-tight">
                    {item.cakeName}
                  </p>
                  <p className="text-skyline mt-0.5 text-sm">{item.sizeLabel}</p>
                  <p className="text-skyline mt-1.5 text-sm">
                    {pickupLabel(item, cart.fulfilmentMethod)}
                  </p>
                </div>
                <button
                  className="text-skyline hover:text-ink shrink-0 text-sm font-medium"
                  onClick={() => {
                    const cart = readFreshPickCart();
                    if (!cart) return;
                    writeFreshPickCart(
                      removeFreshPickFromCart(cart, item.extraStockId),
                    );
                  }}
                  type="button"
                >
                  Remove
                </button>
              </div>
              <p className="text-ink mt-3 text-right text-sm font-medium tabular-nums">
                {item.unitPrice != null ? formatRm(item.unitPrice) : "—"}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ExtraOrderSummary({
  cart,
  onContinue,
}: {
  cart: FreshPickCart;
  onContinue?: () => void;
}) {
  const total = freshPickCartTotal(cart);
  return (
    <div className="space-y-5">
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-skyline text-[11px] font-medium tracking-[0.16em] uppercase">
            {workspaceFulfilmentSectionTitle(cart.fulfilmentMethod)}
          </dt>
          <dd className="text-ink mt-1 font-medium">
            {cart.pickupDate ? (
              <>
                {formatShortBusinessDate(cart.pickupDate) || cart.pickupDate}
                {cart.fulfilmentMethod === "dine_in" ? (
                  <>
                    <br />
                    Reservation · {formatPickupTime(cart.reservationTime)}
                    <br />
                    Cake served · {formatPickupTime(cart.pickupTime)}
                    {parseDineInVenue(cart.dineInVenue) ? (
                      <>
                        <br />
                        {dineInVenueLabel(parseDineInVenue(cart.dineInVenue)!)}
                      </>
                    ) : null}
                  </>
                ) : (
                  <> · {formatPickupTime(cart.pickupTime)}</>
                )}
              </>
            ) : (
              "Not selected yet"
            )}
          </dd>
        </div>
      </dl>
      <CatalogueVoucherCartPanel
        draft={{
          pickupDate: cart.pickupDate,
          items: cart.items.map((item) => ({
            cakeId: "",
            sizeId: item.extraStockId,
            sizeLabel: item.sizeLabel,
            quantity: 1,
            unitPrice: item.unitPrice ?? 0,
          })),
        }}
        orderType="fresh_pick"
      />
      <CatalogueVoucherCartTotals
        commercialTotal={total}
        draft={{
          pickupDate: cart.pickupDate,
          items: cart.items.map((item) => ({
            cakeId: "",
            sizeId: item.extraStockId,
            sizeLabel: item.sizeLabel,
            quantity: 1,
            unitPrice: item.unitPrice ?? 0,
          })),
        }}
        orderType="fresh_pick"
      />
      <Link
        className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 w-full items-center justify-center rounded-md px-5 text-sm font-medium transition duration-200"
        href={freshPickCheckoutHref()}
      >
        View My Order
      </Link>
      <Link
        className="text-ink hover:text-skyline inline-flex min-h-11 w-full items-center justify-center text-sm font-medium"
        href="/extra"
        onClick={onContinue}
      >
        Continue shopping
      </Link>
    </div>
  );
}

export function FreshPickCartShell({
  desktopRail = true,
}: {
  desktopRail?: boolean;
} = {}) {
  const cart = useFreshPickCart();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const hasItems = freshPickCartHasItems(cart);
  const count = freshPickCartCount(cart);
  const total = freshPickCartTotal(cart);
  const itemLabel = count === 1 ? "1 item" : `${count} items`;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    function syncDesktop() {
      if (desktopRail && media.matches) setOpen(false);
      document.body.style.marginRight =
        desktopRail && hasItems && media.matches ? DESKTOP_ORDER_RAIL_WIDTH : "";
    }
    syncDesktop();
    media.addEventListener("change", syncDesktop);
    return () => {
      document.body.style.marginRight = "";
      media.removeEventListener("change", syncDesktop);
    };
  }, [desktopRail, hasItems]);

  useEffect(() => {
    function onOpenOrder() {
      setOpen(true);
    }
    window.addEventListener(FRESH_PICK_CART_OPEN_EVENT, onOpenOrder);
    return () => {
      window.removeEventListener(FRESH_PICK_CART_OPEN_EVENT, onOpenOrder);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!hasItems || !cart) return null;

  return (
    <>
      <div aria-hidden className="h-[calc(4.5rem+env(safe-area-inset-bottom))] md:hidden" />
      {!desktopRail ? <div aria-hidden className="hidden h-24 md:block" /> : null}

      <button
        aria-label={`${itemLabel}, ${formatRm(total)}. View order.`}
        className="bg-ink text-mist fixed right-0 bottom-0 left-0 z-40 flex min-h-[4.25rem] items-center justify-between gap-4 px-5 pt-2 text-left shadow-[0_-8px_24px_rgba(28,25,22,0.18)] md:hidden"
        onClick={() => setOpen(true)}
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        type="button"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[11px] font-medium tracking-[0.22em] uppercase">
            Your Order
          </span>
          <span
            aria-live="polite"
            className="flex flex-wrap items-baseline gap-x-1.5 text-[13px] leading-tight font-medium tabular-nums"
          >
            <span>{itemLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{formatRm(total)}</span>
          </span>
        </span>
        <span className="border-mist/25 inline-flex shrink-0 items-center gap-2 border-l pl-4 text-[15px] font-semibold tracking-tight whitespace-nowrap">
          View Order
          <span aria-hidden="true" className="text-lg leading-none">
            →
          </span>
        </span>
      </button>

      {createPortal(
        <>
          {open ? (
            <div className={desktopRail ? "md:hidden" : ""}>
              <div
                aria-hidden
                className="bg-ink/40 animate-storefront-fade fixed inset-0 z-50"
                onClick={() => setOpen(false)}
              />
              <div
                aria-labelledby={titleId}
                aria-modal="true"
                className={
                  desktopRail
                    ? "bg-mist text-ink fixed inset-0 z-[60] flex h-dvh flex-col"
                    : "bg-mist text-ink fixed inset-0 z-[60] flex h-dvh flex-col md:inset-y-8 md:right-8 md:left-auto md:h-auto md:max-h-[calc(100dvh-4rem)] md:w-[24rem] md:rounded-lg md:border md:border-fog md:shadow-[0_8px_40px_rgba(28,25,22,0.12)]"
                }
                role="dialog"
              >
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3 px-5 pt-5">
                    <div>
                      <h2
                        className="font-display text-ink text-3xl tracking-tight"
                        id={titleId}
                      >
                        Your Order
                      </h2>
                      <p className="text-skyline mt-1 text-sm">{itemLabel}</p>
                    </div>
                    <button
                      aria-label="Close order"
                      className="text-skyline hover:text-ink inline-flex min-h-11 min-w-11 items-center justify-center text-sm font-medium"
                      onClick={() => setOpen(false)}
                      type="button"
                    >
                      Close
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-5">
                    <ExtraOrderLines cart={cart} />
                  </div>
                  <div className="border-fog border-t px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                    <ExtraOrderSummary
                      cart={cart}
                      onContinue={() => setOpen(false)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {desktopRail ? (
            <aside
              aria-labelledby={`${titleId}-desktop`}
              className="border-fog bg-mist hidden md:fixed md:inset-y-0 md:right-0 md:left-auto md:z-30 md:flex md:w-[20.5rem] md:flex-col md:border-l"
              role="complementary"
            >
              <div className="px-6 pt-8">
                <p className="text-signal text-[11px] font-medium tracking-[0.22em] uppercase">
                  Whitebird
                </p>
                <h2
                  className="font-display text-ink mt-2 text-3xl tracking-tight"
                  id={`${titleId}-desktop`}
                >
                  Your Order
                </h2>
                <p className="text-skyline mt-1 text-sm">{itemLabel}</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6">
                <ExtraOrderLines cart={cart} />
              </div>
              <div className="px-6 pt-4 pb-8">
                <ExtraOrderSummary cart={cart} />
              </div>
            </aside>
          ) : null}
        </>,
        document.body,
      )}
    </>
  );
}
