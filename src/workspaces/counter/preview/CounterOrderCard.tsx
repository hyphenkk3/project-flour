import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  COUNTER_COLLECTION_LABEL,
  COUNTER_STATUS_LABEL,
  COUNTER_STATUS_TONE,
  counterOrderHref,
  type CounterHeroState,
  type CounterOrder,
} from "@/workspaces/counter/preview/counter-preview-demo";
import type { JourneyStep } from "@/workspaces/preview-journey/journey";

type CounterOrderCardProps = {
  order: CounterOrder;
  heroState: CounterHeroState;
  journeyStep?: JourneyStep | null;
};

export function CounterOrderCard({
  order,
  heroState,
  journeyStep = null,
}: CounterOrderCardProps) {
  const meta =
    order.status === "completed" && order.collectedAt
      ? `Collected ${order.collectedAt}`
      : order.status === "arrived" || order.status === "verified"
        ? `Arrived ${order.arrivedAt ?? ""}`.trim()
        : COUNTER_COLLECTION_LABEL[order.collectionMethod];

  return (
    <article
      className={`rounded-2xl border bg-white p-4 ${
        journeyStep && order.id === "amy"
          ? "border-signal/50 ring-signal/15 ring-2"
          : "border-fog"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-signal text-sm font-semibold tracking-tight">
          {order.collectionTime}
        </p>
        {order.status === "verified" ? (
          <StatusBadge
            label={COUNTER_STATUS_LABEL.verified}
            tone={COUNTER_STATUS_TONE.verified}
          />
        ) : null}
      </div>
      <h3 className="font-display text-ink mt-1 text-xl leading-tight tracking-tight">
        {order.guestLabel}
      </h3>
      <p className="text-ink mt-1 text-sm">
        {order.cakeName}
        <span className="text-skyline"> · {order.cakeSize}</span>
      </p>
      <p className="text-skyline mt-3 text-sm">{meta}</p>
      {order.specialNotes ? (
        <p className="text-ink mt-2 text-sm font-medium">
          {order.specialNotes}
        </p>
      ) : null}
      <Link
        className="text-signal hover:text-ink mt-4 inline-flex min-h-11 items-center text-sm font-medium transition"
        href={counterOrderHref(order.id, heroState, journeyStep)}
      >
        Open →
      </Link>
    </article>
  );
}
