import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CounterOrderCard } from "@/workspaces/counter/preview/CounterOrderCard";
import { CounterPreviewChrome } from "@/workspaces/counter/preview/CounterPreviewChrome";
import type { JourneyStep } from "@/workspaces/preview-journey/journey";
import {
  COUNTER_BOARD_SECTIONS,
  COUNTER_STATUS_TONE,
  counterOrderHref,
  getCounterBoard,
  getCounterOrders,
  type CounterHeroState,
  type CounterStatus,
} from "@/workspaces/counter/preview/counter-preview-demo";

type CounterCollectionBoardProps = {
  heroState: CounterHeroState;
  journeyStep?: JourneyStep | null;
};

const SECTION_TONE: Record<
  (typeof COUNTER_BOARD_SECTIONS)[number]["id"],
  CounterStatus
> = {
  waiting: "waiting",
  arrived: "arrived",
  completed: "completed",
};

export function CounterCollectionBoard({
  heroState,
  journeyStep = null,
}: CounterCollectionBoardProps) {
  const orders = getCounterOrders(heroState);
  const board = getCounterBoard(orders);
  const amy = orders.find((order) => order.id === "amy");

  return (
    <CounterPreviewChrome heroState={heroState} journeyStep={journeyStep}>
      <main className="mx-auto w-full max-w-6xl px-5 py-7 pb-16 sm:px-8 sm:py-10">
        <div>
          <h1 className="font-display text-ink text-3xl tracking-tight sm:text-4xl">
            Who is collecting
          </h1>
          <p className="text-skyline mt-2 text-sm sm:text-base">
            Friday, 21 August · {orders.length} celebrations
          </p>
        </div>

        {heroState === "none" && journeyStep && amy ? (
          <div className="mt-6 space-y-3">
            <p className="border-status-info/20 bg-status-info-soft text-status-info rounded-2xl border px-4 py-3 text-sm leading-relaxed">
              {amy.guestLabel} is ready at the counter.
            </p>
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={counterOrderHref(amy.id, heroState, journeyStep)}
            >
              Open {amy.guestLabel} →
            </Link>
          </div>
        ) : null}
        {heroState === "arrived" && amy ? (
          <p className="border-status-warning/20 bg-status-warning-soft text-status-warning mt-6 rounded-2xl border px-4 py-3 text-sm leading-relaxed">
            {amy.guestLabel} is at the counter. Verify before handover.
          </p>
        ) : null}
        {heroState === "verified" && amy ? (
          <p className="border-status-info/20 bg-status-info-soft text-status-info mt-6 rounded-2xl border px-4 py-3 text-sm leading-relaxed">
            {amy.guestLabel}’s order is verified. Ready to collect.
          </p>
        ) : null}
        {heroState === "collected" && amy ? (
          <div className="mt-6 space-y-3">
            <p className="border-status-success/20 bg-status-success-soft text-status-success rounded-2xl border px-4 py-3 text-sm leading-relaxed">
              {amy.guestLabel} collected. This celebration is completed.
            </p>
            {journeyStep ? (
              <Link
                className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
                href="/preview"
              >
                Back to journey hub
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-3 lg:items-start">
          {COUNTER_BOARD_SECTIONS.map((section) => {
            const column = board[section.id];
            return (
              <section key={section.id}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <StatusBadge
                    label={section.label}
                    tone={COUNTER_STATUS_TONE[SECTION_TONE[section.id]]}
                  />
                  <p className="text-skyline text-sm tabular-nums">
                    {column.length}
                  </p>
                </div>
                {column.length === 0 ? (
                  <p className="text-skyline border-fog/80 rounded-2xl border border-dashed px-4 py-8 text-center text-sm">
                    None
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {column.map((order) => (
                      <li key={order.id}>
                        <CounterOrderCard
                          heroState={heroState}
                          journeyStep={journeyStep}
                          order={order}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </main>
    </CounterPreviewChrome>
  );
}
