import Link from "next/link";
import { formatDdMmYyyy } from "@/lib/dates";
import { dineInVenueLabel } from "@/engines/business-calendar/dine-in-hours";
import {
  FRESH_PICKS_SUCCESS_CONTACT,
  FRESH_PICKS_SUCCESS_FLOW,
  FRESH_PICKS_SUCCESS_PAYMENT,
  FRESH_PICKS_SUCCESS_TITLE,
} from "@/engines/extra/customer-fresh-picks";
import {
  workspaceFulfilmentSectionTitle,
  workspaceScheduleDateLabel,
  workspaceScheduleTimeLabel,
} from "@/engines/orders/fulfilment";
import { ClearPreorderDraftOnSuccess } from "@/workspaces/storefront/checkout/ClearPreorderDraft";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import { getGuestPreorderReceipt } from "@/workspaces/storefront/checkout/receipt";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";

type StorefrontSuccessPageProps = {
  orderId?: string;
  flow?: string;
};

export async function StorefrontSuccessPage({
  orderId,
  flow,
}: StorefrontSuccessPageProps) {
  const receipt = orderId ? await getGuestPreorderReceipt(orderId) : null;
  const isFreshPick =
    flow === FRESH_PICKS_SUCCESS_FLOW || Boolean(receipt?.isFreshPick);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-16 sm:px-6">
      {isFreshPick ? null : <ClearPreorderDraftOnSuccess />}
      <div className="text-center">
        <h1 className="font-display text-ink text-3xl tracking-tight">
          {isFreshPick ? FRESH_PICKS_SUCCESS_TITLE : "Order Received"}
        </h1>
        <p className="text-skyline mt-4 text-base leading-relaxed">
          {isFreshPick ? (
            <>
              {FRESH_PICKS_SUCCESS_PAYMENT}
              <br />
              {FRESH_PICKS_SUCCESS_CONTACT}
            </>
          ) : (
            <>
              Payment Pending
              <br />
              Whitebird will contact you via WhatsApp.
            </>
          )}
        </p>
      </div>

      {receipt ? (
        <section className="border-fog mt-8 rounded-xl border bg-white px-5 py-4 text-left">
          <p className="text-skyline text-[11px] font-semibold tracking-[0.14em] uppercase">
            Order recap
          </p>
          <ul className="mt-3 space-y-2">
            {receipt.items.map((item) => (
              <li className="text-ink text-sm" key={item.key}>
                <span className="font-medium">{item.cakeName}</span>
                <span className="text-skyline">
                  {" "}
                  · {item.sizeLabel} × {item.quantity}
                  {item.unitPrice != null
                    ? ` · ${formatRm(item.unitPrice * item.quantity)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-fog pt-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">Fulfilment</dt>
              <dd className="text-ink text-right font-medium">
                {workspaceFulfilmentSectionTitle(receipt.fulfilmentMethod)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">
                {workspaceScheduleDateLabel(receipt.fulfilmentMethod)}
              </dt>
              <dd className="text-ink text-right font-medium">
                {formatDdMmYyyy(receipt.pickupDate)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">
                {workspaceScheduleTimeLabel(receipt.fulfilmentMethod)}
              </dt>
              <dd className="text-ink text-right font-medium">
                {formatPickupTime(receipt.pickupTime)}
              </dd>
            </div>
            {receipt.fulfilmentMethod === "dine_in" &&
            receipt.reservationTime ? (
              <div className="flex justify-between gap-4">
                <dt className="text-skyline">Dine-in reservation time</dt>
                <dd className="text-ink text-right font-medium">
                  {formatPickupTime(receipt.reservationTime)}
                </dd>
              </div>
            ) : null}
            {receipt.fulfilmentMethod === "dine_in" && receipt.dineInVenue ? (
              <div className="flex justify-between gap-4">
                <dt className="text-skyline">Venue</dt>
                <dd className="text-ink text-right font-medium">
                  {dineInVenueLabel(receipt.dineInVenue)}
                </dd>
              </div>
            ) : null}
            {receipt.fulfilmentMethod === "dine_in" &&
            receipt.guestCount != null ? (
              <div className="flex justify-between gap-4">
                <dt className="text-skyline">Guests</dt>
                <dd className="text-ink text-right font-medium">
                  {receipt.guestCount}{" "}
                  {receipt.guestCount === 1 ? "guest" : "guests"}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-skyline">Total</dt>
              <dd className="text-ink text-right font-semibold">
                {formatRm(receipt.total)}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="mt-8 space-y-2 text-left text-sm">
        {isFreshPick ? (
          <>
            <p className="text-ink flex items-start gap-2 font-medium">
              <span aria-hidden className="text-status-success">
                ✓
              </span>
              {FRESH_PICKS_SUCCESS_TITLE}
            </p>
            <p className="text-skyline flex items-start gap-2 pl-5">
              {FRESH_PICKS_SUCCESS_PAYMENT}
            </p>
            <p className="text-skyline flex items-start gap-2 pl-5">
              {FRESH_PICKS_SUCCESS_CONTACT}
            </p>
          </>
        ) : (
          <>
            <p className="text-ink flex items-start gap-2 font-medium">
              <span aria-hidden className="text-status-success">
                ✓
              </span>
              Order Received
            </p>
            <p className="text-skyline flex items-start gap-2 pl-5">
              Payment Pending
            </p>
            <p className="text-skyline flex items-start gap-2 pl-5">
              Whitebird will contact you via WhatsApp.
            </p>
          </>
        )}
      </section>

      <div className="mt-10 text-center">
        {isFreshPick ? (
          <Link
            className="text-signal text-sm font-medium underline"
            href="/extra"
          >
            Back to Fresh Picks
          </Link>
        ) : (
          <Link className="text-signal text-sm font-medium underline" href="/">
            Back to collection
          </Link>
        )}
      </div>
    </main>
  );
}
