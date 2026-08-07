import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BakeryOrderCard } from "@/workspaces/bakery/preview/BakeryOrderCard";
import { BakeryPreviewChrome } from "@/workspaces/bakery/preview/BakeryPreviewChrome";
import { collectionOrderJourneyHref } from "@/workspaces/preview-journey/journey";
import type { JourneyStep } from "@/workspaces/preview-journey/journey";
import {
  BAKERY_BOARD_SECTIONS,
  BAKERY_STATUS_LABEL,
  BAKERY_STATUS_TONE,
  bakeryOrderHref,
  getBakeryBoard,
  getBakeryOrders,
  type BakeryHeroState,
} from "@/workspaces/bakery/preview/bakery-preview-demo";

type BakeryProductionBoardProps = {
  heroState: BakeryHeroState;
  journeyStep?: JourneyStep | null;
};

export function BakeryProductionBoard({
  heroState,
  journeyStep = null,
}: BakeryProductionBoardProps) {
  const orders = getBakeryOrders(heroState);
  const board = getBakeryBoard(orders);
  const amy = orders.find((order) => order.id === "amy");

  return (
    <BakeryPreviewChrome heroState={heroState} journeyStep={journeyStep}>
      <main className="mx-auto w-full max-w-6xl px-5 py-7 pb-16 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-ink text-3xl tracking-tight sm:text-4xl">
              What we make today
            </h1>
            <p className="text-skyline mt-2 text-sm sm:text-base">
              Friday, 21 August · {orders.length} cakes
            </p>
          </div>
        </div>

        {heroState === "none" && journeyStep && amy ? (
          <div className="mt-6 space-y-3">
            <p className="border-status-info/20 bg-status-info-soft text-status-info rounded-2xl border px-4 py-3 text-sm leading-relaxed">
              {amy.cakeName} is ready to start.
            </p>
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={bakeryOrderHref(amy.id, heroState, journeyStep)}
            >
              Open {amy.cakeName} →
            </Link>
          </div>
        ) : null}
        {heroState === "started" && amy ? (
          <p className="border-status-warning/20 bg-status-warning-soft text-status-warning mt-6 rounded-2xl border px-4 py-3 text-sm leading-relaxed">
            {amy.cakeName} is in production.
          </p>
        ) : null}
        {heroState === "ready" && amy ? (
          <div className="mt-6 space-y-3">
            <p className="border-status-success/20 bg-status-success-soft text-status-success rounded-2xl border px-4 py-3 text-sm leading-relaxed">
              {amy.cakeName} is ready for Counter. Bakery is done.
            </p>
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition"
              href={
                journeyStep
                  ? collectionOrderJourneyHref("amy", "ready_for_collection")
                  : "/preview/collection/orders/amy"
              }
            >
              Continue to Collection →
            </Link>
          </div>
        ) : null}
        {heroState === "accepted" ? (
          <p className="border-status-info/20 bg-status-info-soft text-status-info mt-6 rounded-2xl border px-4 py-3 text-sm leading-relaxed">
            Collection accepted Chocolate D’Amour. It has left the Bakery board.
          </p>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-3 lg:items-start">
          {BAKERY_BOARD_SECTIONS.map((status) => {
            const column = board[status];
            return (
              <section key={status}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      label={BAKERY_STATUS_LABEL[status]}
                      tone={BAKERY_STATUS_TONE[status]}
                    />
                  </div>
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
                        <BakeryOrderCard
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
    </BakeryPreviewChrome>
  );
}
