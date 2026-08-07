import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OrderHealthBadge } from "@/workspaces/customer-operations/preview/OrderHealthBadge";
import { PreviewChrome } from "@/workspaces/customer-operations/preview/PreviewChrome";
import {
  CUSTOMER_COLLECTION_LABEL,
  CUSTOMER_TO_STAFF,
  PRIORITY_BADGE_LABEL,
  PRIORITY_BADGE_TONE,
  QUEUE_STATUS_LABEL,
  QUEUE_STATUS_TONE,
  STAFF_COLLECTION_LABEL,
  formatPreviewPrice,
  previewConfirmHref,
  previewCustomerConfirmedHref,
  previewDashboardHref,
  previewPaymentHref,
  previewReceiptHref,
  previewReceiptSubmittedHref,
  relationshipSummary,
  type PreviewHeroState,
  type PreviewOrder,
} from "@/workspaces/customer-operations/preview/preview-demo";
import {
  bakeryOrderJourneyHref,
  type JourneyStep,
} from "@/workspaces/preview-journey/journey";

type PreviewOrderWorkspaceProps = {
  order: PreviewOrder;
  heroState: PreviewHeroState;
  journeyStep?: JourneyStep | null;
};

const QUICK_ACTIONS = [
  "Prepare Message",
  "Add a team note",
  "Edit celebration",
  "Assign",
  "Snooze",
  "Archive",
] as const;

export function PreviewOrderWorkspace({
  order,
  heroState,
  journeyStep = null,
}: PreviewOrderWorkspaceProps) {
  const canSendSummary =
    order.status === "needs_review" && Boolean(order.confirmationMessage);
  const canSendPayment =
    order.status === "awaiting_payment" &&
    Boolean(order.paymentMessage) &&
    heroState === "confirmed";
  const canReviewReceipt =
    order.status === "payment_verification" &&
    heroState === "receipt_submitted";
  const canSimulateConfirmation =
    order.status === "waiting_for_customer" &&
    Boolean(order.confirmationMessage);
  const canSimulateReceipt =
    order.status === "awaiting_payment" && heroState === "payment_requested";
  const staffMethod = CUSTOMER_TO_STAFF[order.collectionMethod];
  const relationship = order.relationship;
  const payment = order.payment;
  const showPaymentCard =
    Boolean(payment) &&
    (order.status === "awaiting_payment" ||
      order.status === "payment_verification" ||
      order.status === "ready_for_bakery");

  return (
    <PreviewChrome heroState={heroState} journeyStep={journeyStep}>
      <main className="mx-auto w-full max-w-6xl px-5 pt-6 pb-44 sm:px-8 sm:pt-10">
        <Link
          className="text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium transition"
          href={previewDashboardHref(heroState, journeyStep)}
        >
          ← This morning
        </Link>

        <header className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <OrderHealthBadge health={order.health} size="md" />
            <StatusBadge
              label={QUEUE_STATUS_LABEL[order.status]}
              tone={QUEUE_STATUS_TONE[order.status]}
            />
            {order.badges.map((badge) => (
              <StatusBadge
                key={badge}
                label={PRIORITY_BADGE_LABEL[badge]}
                tone={PRIORITY_BADGE_TONE[badge]}
              />
            ))}
          </div>
          <div>
            <h1 className="font-display text-ink text-4xl tracking-tight sm:text-5xl">
              {order.customerName}
            </h1>
            <p className="text-skyline mt-2 text-base sm:text-lg">
              {order.cakeName} · {order.cakeSize}
            </p>
          </div>
        </header>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(17rem,0.95fr)] lg:items-start">
          <div className="space-y-5">
            <section className="border-fog rounded-3xl border bg-white p-5 sm:p-6">
              <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                Guest
              </h2>
              <p className="text-ink mt-3 text-base leading-relaxed font-medium">
                {relationshipSummary(relationship)}
              </p>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-skyline">Favourite cake</dt>
                  <dd className="text-ink mt-1 font-medium">
                    {relationship.favouriteCake ?? "We’ll learn this together"}
                  </dd>
                </div>
                <div>
                  <dt className="text-skyline">Last celebration</dt>
                  <dd className="text-ink mt-1 font-medium">
                    {relationship.lastCelebration ?? "This is the first"}
                  </dd>
                </div>
                <div>
                  <dt className="text-skyline">Phone</dt>
                  <dd className="text-ink mt-1 font-medium">
                    {order.customerPhone}
                  </dd>
                </div>
                <div>
                  <dt className="text-skyline">Email</dt>
                  <dd className="text-ink mt-1 font-medium break-all">
                    {order.customerEmail}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="border-fog rounded-3xl border bg-white p-5 sm:p-6">
              <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                The cake
              </h2>
              <p className="font-display text-ink mt-3 text-3xl tracking-tight">
                {order.cakeName}
              </p>
              <p className="text-skyline mt-1 text-sm">{order.cakeSize}</p>
              {payment ? (
                <dl className="border-fog mt-6 space-y-3 border-t pt-4 text-sm">
                  <div className="flex items-end justify-between gap-3">
                    <dt className="text-skyline">Cake price</dt>
                    <dd className="text-ink font-medium">
                      {formatPreviewPrice(payment.listTotal)}
                    </dd>
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <dt className="text-skyline">Promotion</dt>
                    <dd className="text-ink font-medium">
                      -{formatPreviewPrice(payment.promotionAmount)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="border-fog mt-6 flex items-end justify-between border-t pt-4">
                  <span className="text-skyline text-sm">
                    Celebration total
                  </span>
                  <span className="font-display text-ink text-3xl tracking-tight">
                    {formatPreviewPrice(order.totalAmount)}
                  </span>
                </div>
              )}
            </section>

            <section className="border-fog rounded-3xl border bg-white p-5 sm:p-6">
              <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                Collection
              </h2>
              <dl className="mt-4 grid gap-4 text-sm">
                <div>
                  <dt className="text-skyline">Staff</dt>
                  <dd className="text-ink mt-1 text-base font-medium">
                    {STAFF_COLLECTION_LABEL[staffMethod]}
                  </dd>
                </div>
                <div>
                  <dt className="text-skyline">Customer selected</dt>
                  <dd className="text-ink mt-1 text-base font-medium">
                    {CUSTOMER_COLLECTION_LABEL[order.collectionMethod]}
                  </dd>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-skyline">Date</dt>
                    <dd className="text-ink mt-1 font-medium">
                      {order.pickupWeekday}, {order.pickupDateLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-skyline">Time</dt>
                    <dd className="text-ink mt-1 font-medium">
                      {order.pickupTime}
                    </dd>
                  </div>
                </div>
              </dl>
            </section>

            {showPaymentCard && payment ? (
              <section className="border-fog rounded-3xl border bg-white p-5 sm:p-6">
                <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                  Payment
                </h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-skyline">Total Payable</dt>
                    <dd className="text-ink font-medium">
                      {formatPreviewPrice(payment.amountPayable)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-skyline">Received</dt>
                    <dd className="text-ink font-medium">
                      {formatPreviewPrice(payment.received)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-skyline">Outstanding</dt>
                    <dd className="text-ink font-medium">
                      {formatPreviewPrice(
                        payment.amountPayable - payment.received,
                      )}
                    </dd>
                  </div>
                  <div className="border-fog flex justify-between gap-3 border-t pt-3">
                    <dt className="text-skyline">Status</dt>
                    <dd className="text-ink font-medium">
                      {QUEUE_STATUS_LABEL[order.status]}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}

            <section className="border-fog rounded-3xl border bg-white p-5 sm:p-6">
              <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                With compliments
              </h2>
              {order.complimentaryItems.length === 0 ? (
                <p className="text-skyline mt-3 text-sm">
                  Nothing extra this time.
                </p>
              ) : (
                <ul className="mt-4 space-y-2.5 text-sm">
                  {order.complimentaryItems.map((item) => (
                    <li
                      className="text-ink flex justify-between gap-3"
                      key={item.id}
                    >
                      <span>{item.label}</span>
                      <span className="text-skyline">×{item.quantity}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {canSimulateConfirmation ? (
              <section className="border-signal/20 bg-signal/[0.04] rounded-3xl border p-5 sm:p-6">
                <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                  Guest reply
                </h2>
                <p className="text-skyline mt-2 text-sm leading-relaxed">
                  Preview only — simulate Amy confirming her order so payment
                  can be requested.
                </p>
                <Link
                  className="bg-ink text-mist hover:bg-skyline mt-4 inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
                  href={previewCustomerConfirmedHref(order.id, journeyStep)}
                >
                  Amy confirmed her order
                </Link>
              </section>
            ) : null}

            {canSimulateReceipt ? (
              <section className="border-signal/20 bg-signal/[0.04] rounded-3xl border p-5 sm:p-6">
                <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                  Guest payment
                </h2>
                <p className="text-skyline mt-2 text-sm leading-relaxed">
                  Preview only — simulate Amy sending her payment receipt so
                  Vivian can review it.
                </p>
                <Link
                  className="bg-ink text-mist hover:bg-skyline mt-4 inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
                  href={previewReceiptSubmittedHref(order.id, journeyStep)}
                >
                  Amy submitted her payment receipt
                </Link>
              </section>
            ) : null}

            <section className="border-fog rounded-3xl border bg-white p-5 sm:p-6">
              <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                A note from the guest
              </h2>
              {order.customerMessage ? (
                <p className="text-ink mt-3 text-base leading-relaxed">
                  “{order.customerMessage}”
                </p>
              ) : (
                <p className="text-skyline mt-3 text-sm">No note this time.</p>
              )}
            </section>
          </div>

          <div className="space-y-5">
            <section className="border-fog rounded-3xl border bg-white p-5 sm:p-6">
              <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                Timeline
              </h2>
              <ol className="mt-5">
                {order.timeline.map((event, index) => (
                  <li className="flex gap-4" key={event.id}>
                    <div className="flex w-11 shrink-0 flex-col items-end pt-0.5">
                      <span
                        className={`text-xs font-medium ${
                          event.isCurrent ? "text-signal" : "text-skyline"
                        }`}
                      >
                        {event.time}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={`mt-1.5 size-2.5 rounded-full ${
                            event.isCurrent ? "bg-signal" : "bg-fog"
                          }`}
                        />
                        {index < order.timeline.length - 1 ? (
                          <span className="bg-fog min-h-11 w-px flex-1" />
                        ) : null}
                      </div>
                      <div className="pb-6">
                        <p
                          className={`text-sm font-medium ${
                            event.isCurrent ? "text-signal" : "text-ink"
                          }`}
                        >
                          {event.title}
                        </p>
                        {event.detail ? (
                          <p className="text-skyline mt-1 text-sm leading-relaxed">
                            {event.detail}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="border-fog rounded-3xl border bg-white p-5 sm:p-6">
              <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                For the team
              </h2>
              {order.internalNotes.length === 0 ? (
                <p className="text-skyline mt-3 text-sm">No team notes yet.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {order.internalNotes.map((note) => (
                    <li
                      className="text-skyline text-sm leading-relaxed"
                      key={note}
                    >
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="border-fog rounded-3xl border bg-white p-5 sm:p-6">
              <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
                Quick actions
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {QUICK_ACTIONS.map((action) => {
                  if (action === "Prepare Message" && canSendSummary) {
                    return (
                      <Link
                        className="border-fog text-ink hover:border-signal inline-flex min-h-12 items-center justify-center rounded-xl border bg-white px-3 text-center text-sm font-medium transition"
                        href={previewConfirmHref(order.id, journeyStep)}
                        key={action}
                      >
                        {action}
                      </Link>
                    );
                  }
                  if (action === "Prepare Message" && canSendPayment) {
                    return (
                      <Link
                        className="border-fog text-ink hover:border-signal inline-flex min-h-12 items-center justify-center rounded-xl border bg-white px-3 text-center text-sm font-medium transition"
                        href={previewPaymentHref(order.id, journeyStep)}
                        key={action}
                      >
                        Prepare Payment Request
                      </Link>
                    );
                  }
                  if (action === "Prepare Message" && canReviewReceipt) {
                    return (
                      <Link
                        className="border-fog text-ink hover:border-signal inline-flex min-h-12 items-center justify-center rounded-xl border bg-white px-3 text-center text-sm font-medium transition"
                        href={previewReceiptHref(order.id, journeyStep)}
                        key={action}
                      >
                        Review receipt
                      </Link>
                    );
                  }

                  return (
                    <button
                      className="border-fog text-skyline inline-flex min-h-12 cursor-default items-center justify-center rounded-xl border bg-white px-3 text-center text-sm"
                      key={action}
                      type="button"
                    >
                      {action}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </main>

      <div className="border-fog sticky bottom-0 z-20 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-4 sm:px-8 sm:py-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl min-w-0">
            <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
              Recommended next action
            </p>
            <p className="text-ink mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">
              {order.recommendedAction.title}
            </p>
            <p className="text-skyline mt-2 text-sm leading-relaxed sm:text-base">
              <span className="text-ink font-medium">Reason · </span>
              {order.recommendedAction.reason}
            </p>
          </div>
          {canSendSummary ? (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={previewConfirmHref(order.id, journeyStep)}
            >
              {order.recommendedAction.buttonLabel}
            </Link>
          ) : canSendPayment ? (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={previewPaymentHref(order.id, journeyStep)}
            >
              {order.recommendedAction.buttonLabel}
            </Link>
          ) : canReviewReceipt ? (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={previewReceiptHref(order.id, journeyStep)}
            >
              {order.recommendedAction.buttonLabel}
            </Link>
          ) : order.status === "ready_for_bakery" ? (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={
                journeyStep
                  ? bakeryOrderJourneyHref("amy", "payment_verified")
                  : "/preview/bakery/orders/amy"
              }
            >
              Continue to Bakery →
            </Link>
          ) : (
            <span className="border-fog text-skyline inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl border px-5 text-sm font-medium">
              {order.recommendedAction.buttonLabel}
            </span>
          )}
        </div>
      </div>
    </PreviewChrome>
  );
}
