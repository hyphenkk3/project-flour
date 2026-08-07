import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CounterPackingChecklist } from "@/workspaces/counter/preview/CounterPackingChecklist";
import { CounterPreviewChrome } from "@/workspaces/counter/preview/CounterPreviewChrome";
import {
  COUNTER_COLLECTION_LABEL,
  COUNTER_STATUS_LABEL,
  COUNTER_STATUS_TONE,
  counterArriveHref,
  counterCollectHref,
  counterDashboardHref,
  counterVerifyHref,
  type CounterHeroState,
  type CounterOrder,
} from "@/workspaces/counter/preview/counter-preview-demo";
import type { JourneyStep } from "@/workspaces/preview-journey/journey";

type CounterOrderWorkspaceProps = {
  order: CounterOrder;
  heroState: CounterHeroState;
  journeyStep?: JourneyStep | null;
};

export function CounterOrderWorkspace({
  order,
  heroState,
  journeyStep = null,
}: CounterOrderWorkspaceProps) {
  const canArrive =
    order.status === "waiting" && order.id === "amy" && heroState === "none";
  const canVerify =
    order.status === "arrived" && order.id === "amy" && heroState === "arrived";
  const canCollect =
    order.status === "verified" &&
    order.id === "amy" &&
    heroState === "verified";

  return (
    <CounterPreviewChrome heroState={heroState} journeyStep={journeyStep}>
      <main className="mx-auto w-full max-w-5xl px-5 pt-5 pb-40 sm:px-8 sm:pt-8">
        <Link
          className="text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium transition"
          href={counterDashboardHref(heroState, journeyStep)}
        >
          ← Desk
        </Link>

        <header className="mt-5 space-y-3">
          <StatusBadge
            label={COUNTER_STATUS_LABEL[order.status]}
            tone={COUNTER_STATUS_TONE[order.status]}
          />
          <div>
            <h1 className="font-display text-ink text-4xl tracking-tight sm:text-5xl">
              {order.guestLabel}
            </h1>
            <p className="text-skyline mt-2 text-base sm:text-lg">
              {order.cakeName} · {order.cakeSize}
            </p>
          </div>
        </header>

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.9fr)] lg:items-start">
          <div className="space-y-4">
            <section className="border-fog rounded-2xl border bg-white p-5">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
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
                    {COUNTER_COLLECTION_LABEL[order.collectionMethod]}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-skyline">Special notes</dt>
                  <dd className="text-ink mt-1 font-medium">
                    {order.specialNotes ?? "None"}
                  </dd>
                </div>
              </dl>
            </section>

            <CounterPackingChecklist items={order.packingItems} />

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
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-5 py-4 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
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
          {canArrive ? (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={counterArriveHref(order.id, journeyStep)}
            >
              {order.recommendedAction.buttonLabel}
            </Link>
          ) : canVerify ? (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={counterVerifyHref(order.id, journeyStep)}
            >
              {order.recommendedAction.buttonLabel}
            </Link>
          ) : canCollect ? (
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={counterCollectHref(order.id, journeyStep)}
            >
              {order.recommendedAction.buttonLabel}
            </Link>
          ) : (
            <span className="border-fog text-skyline inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl border px-5 text-sm font-medium">
              {order.recommendedAction.buttonLabel}
            </span>
          )}
        </div>
      </div>
    </CounterPreviewChrome>
  );
}
