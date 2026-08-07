import Link from "next/link";
import {
  BAKERY_COLLECTION_LABEL,
  bakeryOrderHref,
  type BakeryHeroState,
  type BakeryOrder,
} from "@/workspaces/bakery/preview/bakery-preview-demo";
import type { JourneyStep } from "@/workspaces/preview-journey/journey";

type BakeryOrderCardProps = {
  order: BakeryOrder;
  heroState: BakeryHeroState;
  journeyStep?: JourneyStep | null;
};

export function BakeryOrderCard({
  order,
  heroState,
  journeyStep = null,
}: BakeryOrderCardProps) {
  const meta =
    order.status === "in_production" && order.startedAt
      ? `Started ${order.startedAt}`
      : order.status === "ready_for_counter" && order.readyAt
        ? `Ready ${order.readyAt}`
        : BAKERY_COLLECTION_LABEL[order.collectionMethod];

  return (
    <article
      className={`rounded-2xl border bg-white p-4 ${
        journeyStep && order.id === "amy"
          ? "border-signal/50 ring-signal/15 ring-2"
          : "border-fog"
      }`}
    >
      <p className="text-signal text-sm font-semibold tracking-tight">
        {order.collectionTime}
      </p>
      <h3 className="font-display text-ink mt-1 text-xl leading-tight tracking-tight">
        {order.cakeName}
      </h3>
      <p className="text-ink mt-1 text-sm">
        {order.cakeSize}
        <span className="text-skyline"> · {order.guestLabel}</span>
      </p>
      <p className="text-skyline mt-3 text-sm">{meta}</p>
      {order.specialNotes ? (
        <p className="text-ink mt-2 text-sm font-medium">
          {order.specialNotes}
        </p>
      ) : null}
      <Link
        className="text-signal hover:text-ink mt-4 inline-flex min-h-11 items-center text-sm font-medium transition"
        href={bakeryOrderHref(order.id, heroState, journeyStep)}
      >
        Open →
      </Link>
    </article>
  );
}
