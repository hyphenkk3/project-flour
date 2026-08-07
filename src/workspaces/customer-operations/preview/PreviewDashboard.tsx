import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PreviewChrome } from "@/workspaces/customer-operations/preview/PreviewChrome";
import { PreviewOrderCard } from "@/workspaces/customer-operations/preview/PreviewOrderCard";
import { bakeryOrderJourneyHref } from "@/workspaces/preview-journey/journey";
import type { JourneyStep } from "@/workspaces/preview-journey/journey";
import {
  CUSTOMER_COLLECTION_LABEL,
  QUEUE_STATUS_LABEL,
  QUEUE_STATUS_TONE,
  STAFF_COLLECTION_LABEL,
  getPreviewOrders,
  getPriorityCounts,
  getTodaysSchedule,
  getWorkQueue,
  previewOrderHref,
  type PreviewHeroState,
  type PreviewQueueStatus,
  type PreviewStaffCollection,
} from "@/workspaces/customer-operations/preview/preview-demo";

type PreviewDashboardProps = {
  heroState: PreviewHeroState;
  journeyStep?: JourneyStep | null;
};

const PRIORITY_ITEMS: {
  status: PreviewQueueStatus;
  hint: string;
  later?: boolean;
}[] = [
  {
    status: "needs_review",
    hint: "Read, then send the order summary",
  },
  {
    status: "waiting_for_customer",
    hint: "Nothing to do until they reply",
  },
  {
    status: "awaiting_payment",
    hint: "Request payment, then wait",
  },
  {
    status: "payment_verification",
    hint: "Review the receipt, then verify",
  },
  {
    status: "ready_for_bakery",
    hint: "Payment done — Bakery next",
  },
];

const SCHEDULE_METHODS: PreviewStaffCollection[] = [
  "pickup",
  "delivery",
  "dine_in",
];

export function PreviewDashboard({
  heroState,
  journeyStep = null,
}: PreviewDashboardProps) {
  const orders = getPreviewOrders(heroState);
  const counts = getPriorityCounts(orders);
  const schedule = getTodaysSchedule(orders);
  const queue = getWorkQueue(orders);
  const amy = orders.find((order) => order.id === "amy");

  return (
    <PreviewChrome heroState={heroState} journeyStep={journeyStep}>
      <main className="mx-auto w-full max-w-6xl px-5 py-8 pb-20 sm:px-8 sm:py-12">
        <div className="max-w-2xl">
          <h1 className="font-display text-ink text-4xl tracking-tight sm:text-5xl">
            This morning
          </h1>
          <p className="text-skyline mt-3 text-base leading-relaxed sm:text-lg">
            Only celebrations that need a human touch today.
          </p>
        </div>

        {heroState === "none" && journeyStep && amy ? (
          <div className="mt-8 space-y-3">
            <p className="border-status-info/20 bg-status-info-soft text-status-info rounded-2xl border px-4 py-3.5 text-sm leading-relaxed">
              {amy.customerName} just submitted Chocolate D’Amour. Open her
              celebration to continue.
            </p>
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={previewOrderHref(amy.id, heroState, journeyStep)}
            >
              Open {amy.customerName} →
            </Link>
          </div>
        ) : null}
        {heroState === "summary_sent" && amy ? (
          <div className="mt-8 space-y-3">
            <p className="border-status-success/20 bg-status-success-soft text-status-success rounded-2xl border px-4 py-3.5 text-sm leading-relaxed">
              Order summary marked as sent for {amy.customerName}. This
              celebration is now waiting for the guest.
            </p>
            <Link
              className="text-signal hover:text-ink inline-flex min-h-11 items-center text-sm font-medium transition"
              href={previewOrderHref(amy.id, heroState, journeyStep)}
            >
              Open {amy.customerName} →
            </Link>
          </div>
        ) : null}
        {heroState === "confirmed" && amy ? (
          <div className="mt-8 space-y-3">
            <p className="border-status-info/20 bg-status-info-soft text-status-info rounded-2xl border px-4 py-3.5 text-sm leading-relaxed">
              {amy.customerName} confirmed her order. She is now awaiting
              payment — send the payment request next.
            </p>
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={previewOrderHref(amy.id, heroState, journeyStep)}
            >
              Open {amy.customerName} →
            </Link>
          </div>
        ) : null}
        {heroState === "payment_requested" && amy ? (
          <div className="mt-8 space-y-3">
            <p className="border-status-success/20 bg-status-success-soft text-status-success rounded-2xl border px-4 py-3.5 text-sm leading-relaxed">
              Payment request marked as sent for {amy.customerName}. Waiting for
              payment.
            </p>
            <Link
              className="text-signal hover:text-ink inline-flex min-h-11 items-center text-sm font-medium transition"
              href={previewOrderHref(amy.id, heroState, journeyStep)}
            >
              Open {amy.customerName} →
            </Link>
          </div>
        ) : null}
        {heroState === "receipt_submitted" && amy ? (
          <div className="mt-8 space-y-3">
            <p className="border-status-info/20 bg-status-info-soft text-status-info rounded-2xl border px-4 py-3.5 text-sm leading-relaxed">
              {amy.customerName} submitted a payment receipt. Review it, then
              verify payment.
            </p>
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={previewOrderHref(amy.id, heroState, journeyStep)}
            >
              Open {amy.customerName} →
            </Link>
          </div>
        ) : null}
        {heroState === "payment_verified" && amy ? (
          <div className="mt-8 space-y-3">
            <p className="border-status-success/20 bg-status-success-soft text-status-success rounded-2xl border px-4 py-3.5 text-sm leading-relaxed">
              Payment verified for {amy.customerName}. This celebration is ready
              for the Bakery.
            </p>
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={
                journeyStep
                  ? bakeryOrderJourneyHref("amy", "payment_verified")
                  : "/preview/bakery/orders/amy"
              }
            >
              Continue to Bakery →
            </Link>
          </div>
        ) : null}

        <section className="mt-10">
          <h2 className="text-ink text-sm font-semibold tracking-wide uppercase">
            Today’s priorities
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {PRIORITY_ITEMS.map((item) => (
              <article
                className={`rounded-2xl border px-4 py-4 ${
                  item.later
                    ? "border-fog/80 bg-white/70"
                    : "border-fog bg-white"
                }`}
                key={item.status}
              >
                <StatusBadge
                  label={QUEUE_STATUS_LABEL[item.status]}
                  tone={QUEUE_STATUS_TONE[item.status]}
                />
                <p className="font-display text-ink mt-4 text-4xl tracking-tight">
                  {counts[item.status]}
                </p>
                <p className="text-skyline mt-2 text-sm leading-relaxed">
                  {item.hint}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-ink text-3xl tracking-tight">
            Today at Whitebird
          </h2>
          <p className="text-skyline mt-2 text-sm sm:text-base">
            Friday, 21 August · staff collection view
          </p>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {SCHEDULE_METHODS.map((method) => {
              const items = schedule[method];
              return (
                <article
                  className="border-fog rounded-3xl border bg-white p-5 sm:p-6"
                  key={method}
                >
                  <h3 className="text-ink text-base font-semibold">
                    {STAFF_COLLECTION_LABEL[method]}
                  </h3>
                  <p className="text-skyline mt-1 text-sm">
                    {items.length === 0
                      ? "None today"
                      : `${items.length} today`}
                  </p>
                  <ul className="mt-5 space-y-4">
                    {items.map((order) => (
                      <li key={order.id}>
                        <Link
                          className="hover:text-signal text-ink block transition"
                          href={previewOrderHref(
                            order.id,
                            heroState,
                            journeyStep,
                          )}
                        >
                          <span className="font-medium">
                            {order.customerName}
                          </span>
                          <span className="text-skyline mt-1 block text-sm leading-relaxed">
                            {order.pickupTime} · {order.cakeName}
                          </span>
                          <span className="text-skyline mt-0.5 block text-xs">
                            {CUSTOMER_COLLECTION_LABEL[order.collectionMethod]}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-14">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-ink text-3xl tracking-tight">
                Celebrations needing you
              </h2>
              <p className="text-skyline mt-2 text-sm sm:text-base">
                Needs Review first, then replies and receipts to check.
              </p>
            </div>
            <p className="text-skyline text-sm">{queue.length} celebrations</p>
          </div>
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {queue.map((order) => (
              <li key={order.id}>
                <PreviewOrderCard
                  heroState={heroState}
                  journeyStep={journeyStep}
                  order={order}
                />
              </li>
            ))}
          </ul>
        </section>
      </main>
    </PreviewChrome>
  );
}
