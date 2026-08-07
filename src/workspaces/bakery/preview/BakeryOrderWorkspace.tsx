import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BakeryPackingChecklist } from "@/workspaces/bakery/preview/BakeryPackingChecklist";
import { BakeryPreviewChrome } from "@/workspaces/bakery/preview/BakeryPreviewChrome";
import {
  BAKERY_COLLECTION_LABEL,
  BAKERY_STATUS_LABEL,
  BAKERY_STATUS_TONE,
  bakeryDashboardHref,
  bakeryMarkReadyHref,
  bakeryStartHref,
  type BakeryHeroState,
  type BakeryOrder,
} from "@/workspaces/bakery/preview/bakery-preview-demo";
import {
  collectionOrderJourneyHref,
  type JourneyStep,
} from "@/workspaces/preview-journey/journey";

type BakeryOrderWorkspaceProps = {
  order: BakeryOrder;
  heroState: BakeryHeroState;
  journeyStep?: JourneyStep | null;
};

export function BakeryOrderWorkspace({
  order,
  heroState,
  journeyStep = null,
}: BakeryOrderWorkspaceProps) {
  const canStart =
    order.status === "ready_to_start" &&
    order.id === "amy" &&
    heroState === "none";
  const canMarkReady =
    order.status === "in_production" &&
    order.id === "amy" &&
    heroState === "started";

  return (
    <BakeryPreviewChrome heroState={heroState} journeyStep={journeyStep}>
      <main className="mx-auto w-full max-w-5xl px-5 pt-5 pb-40 sm:px-8 sm:pt-8">
        <Link
          className="text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium transition"
          href={bakeryDashboardHref(heroState, journeyStep)}
        >
          ← Board
        </Link>

        <header className="mt-5 space-y-3">
          <StatusBadge
            label={BAKERY_STATUS_LABEL[order.status]}
            tone={BAKERY_STATUS_TONE[order.status]}
          />
          <div>
            <h1 className="font-display text-ink text-4xl tracking-tight sm:text-5xl">
              {order.cakeName}
            </h1>
            <p className="text-skyline mt-2 text-base sm:text-lg">
              {order.cakeSize} · {order.guestLabel}
            </p>
          </div>
        </header>

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.9fr)] lg:items-start">
          <div className="space-y-4">
            <section className="border-fog rounded-2xl border bg-white p-5">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-skyline">Flavour</dt>
                  <dd className="text-ink mt-1 font-medium">{order.flavour}</dd>
                </div>
                <div>
                  <dt className="text-skyline">Decoration</dt>
                  <dd className="text-ink mt-1 font-medium">
                    {order.decoration}
                  </dd>
                </div>
                <div>
                  <dt className="text-skyline">Collection</dt>
                  <dd className="text-ink mt-1 font-medium">
                    {order.collectionWeekday}, {order.collectionDateLabel}
                  </dd>
                </div>
                <div>
                  <dt className="text-skyline">Time</dt>
                  <dd className="text-ink mt-1 font-medium">
                    {order.collectionTime} ·{" "}
                    {BAKERY_COLLECTION_LABEL[order.collectionMethod]}
                  </dd>
                </div>
              </dl>
            </section>

            <BakeryPackingChecklist items={order.packingItems} />

            <section className="border-fog rounded-2xl border bg-white p-5">
              <h2 className="text-ink text-xs font-semibold tracking-wide uppercase">
                Special notes
              </h2>
              {order.specialNotes ? (
                <p className="text-ink mt-2 text-base font-medium">
                  {order.specialNotes}
                </p>
              ) : (
                <p className="text-skyline mt-2 text-sm">None</p>
              )}
            </section>

            <section className="border-fog rounded-2xl border bg-white p-5">
              <h2 className="text-ink text-xs font-semibold tracking-wide uppercase">
                Internal notes
              </h2>
              {order.internalNotes.length === 0 ? (
                <p className="text-skyline mt-2 text-sm">None</p>
              ) : (
                <ul className="mt-3 space-y-2">
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
          </div>

          <section className="border-fog rounded-2xl border bg-white p-5">
            <h2 className="text-ink text-xs font-semibold tracking-wide uppercase">
              Timeline
            </h2>
            <ol className="mt-4">
              {order.timeline.map((event, index) => (
                <li className="flex gap-3" key={event.id}>
                  <div className="flex w-10 shrink-0 flex-col items-end pt-0.5">
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
                        className={`mt-1.5 size-2 rounded-full ${
                          event.isCurrent ? "bg-signal" : "bg-fog"
                        }`}
                      />
                      {index < order.timeline.length - 1 ? (
                        <span className="bg-fog min-h-8 w-px flex-1" />
                      ) : null}
                    </div>
                    <div className="pb-4">
                      <p
                        className={`text-sm font-medium ${
                          event.isCurrent ? "text-signal" : "text-ink"
                        }`}
                      >
                        {event.title}
                      </p>
                      {event.detail ? (
                        <p className="text-skyline mt-0.5 text-sm leading-relaxed">
                          {event.detail}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>

      <div className="border-fog sticky bottom-0 z-20 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-5 py-4 sm:px-8 sm:py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl min-w-0">
            <p className="text-signal text-[11px] font-medium tracking-[0.18em] uppercase">
              Recommended next action
            </p>
            <p className="text-ink mt-1 text-xl font-semibold tracking-tight">
              {order.recommendedAction.title}
            </p>
            <p className="text-skyline mt-1.5 text-sm leading-relaxed">
              <span className="text-ink font-medium">Reason · </span>
              {order.recommendedAction.reason}
            </p>
          </div>
          {canStart ? (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={bakeryStartHref(order.id, journeyStep)}
            >
              {order.recommendedAction.buttonLabel}
            </Link>
          ) : canMarkReady ? (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={bakeryMarkReadyHref(order.id, journeyStep)}
            >
              {order.recommendedAction.buttonLabel}
            </Link>
          ) : order.status === "ready_for_counter" ? (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={
                journeyStep
                  ? collectionOrderJourneyHref("amy", "ready_for_collection")
                  : "/preview/collection/orders/amy"
              }
            >
              Continue to Collection →
            </Link>
          ) : (
            <span className="border-fog text-skyline inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl border px-5 text-sm font-medium">
              {order.recommendedAction.buttonLabel}
            </span>
          )}
        </div>
      </div>
    </BakeryPreviewChrome>
  );
}
