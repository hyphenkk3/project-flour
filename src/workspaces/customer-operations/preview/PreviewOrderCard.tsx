import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OrderHealthBadge } from "@/workspaces/customer-operations/preview/OrderHealthBadge";
import {
  CUSTOMER_COLLECTION_LABEL,
  CUSTOMER_TO_STAFF,
  PRIORITY_BADGE_LABEL,
  PRIORITY_BADGE_TONE,
  STAFF_COLLECTION_LABEL,
  previewOrderHref,
  type PreviewHeroState,
  type PreviewOrder,
} from "@/workspaces/customer-operations/preview/preview-demo";
import type { JourneyStep } from "@/workspaces/preview-journey/journey";

type PreviewOrderCardProps = {
  order: PreviewOrder;
  heroState: PreviewHeroState;
  journeyStep?: JourneyStep | null;
};

export function PreviewOrderCard({
  order,
  heroState,
  journeyStep = null,
}: PreviewOrderCardProps) {
  const staffMethod = CUSTOMER_TO_STAFF[order.collectionMethod];

  return (
    <article
      className={`flex h-full flex-col rounded-3xl border bg-white p-5 sm:p-6 ${
        journeyStep && order.id === "amy"
          ? "border-signal/50 ring-signal/15 ring-2"
          : "border-fog hover:border-signal/35"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <OrderHealthBadge health={order.health} />
        {order.badges.map((badge) => (
          <StatusBadge
            key={badge}
            label={PRIORITY_BADGE_LABEL[badge]}
            tone={PRIORITY_BADGE_TONE[badge]}
          />
        ))}
      </div>

      <h3 className="font-display text-ink mt-4 text-2xl tracking-tight">
        {order.customerName}
      </h3>
      <p className="text-ink mt-1 text-sm leading-relaxed">
        {order.cakeName} · {order.cakeSize}
      </p>

      <dl className="mt-5 grid gap-3 text-sm">
        <div className="flex items-start justify-between gap-4">
          <dt className="text-skyline">When</dt>
          <dd className="text-ink text-right leading-relaxed">
            {order.pickupWeekday}, {order.pickupDateLabel}
            <span className="text-skyline"> · {order.pickupTime}</span>
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="text-skyline">Collection</dt>
          <dd className="text-right leading-relaxed">
            <span className="text-ink block">
              {STAFF_COLLECTION_LABEL[staffMethod]}
            </span>
            <span className="text-skyline mt-0.5 block text-xs">
              Customer selected:{" "}
              {CUSTOMER_COLLECTION_LABEL[order.collectionMethod]}
            </span>
          </dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="text-skyline">Received</dt>
          <dd className="text-ink text-right">{order.submittedAt}</dd>
        </div>
      </dl>

      <Link
        className="text-signal hover:text-ink mt-6 inline-flex min-h-12 items-center text-sm font-medium transition"
        href={previewOrderHref(order.id, heroState, journeyStep)}
      >
        Open celebration →
      </Link>
    </article>
  );
}
