import type { ReactNode } from "react";
import { formatShortBusinessDate } from "@/lib/dates";
import type { ProductionCapacityRow } from "@/workspaces/library/order-availability/capacity/capacity-event-format";

type WaitingListAvailabilityCardProps = {
  pickupDate: string;
  rows: ProductionCapacityRow[];
};

function CardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-ink text-sm font-semibold tracking-tight">
        Waiting list for this date
      </h3>
      {children}
    </div>
  );
}

export function WaitingListAvailabilityCard({
  pickupDate,
  rows,
}: WaitingListAvailabilityCardProps) {
  const enabled = rows.filter((row) => row.waitingListEnabled);

  if (rows.length === 0) {
    return (
      <CardFrame>
        <p className="text-skyline text-sm">
          No production-capacity row for {formatShortBusinessDate(pickupDate)},
          so waiting list is not available. Add a capacity row and enable
          waiting list there.
        </p>
      </CardFrame>
    );
  }

  if (enabled.length === 0) {
    return (
      <CardFrame>
        <p className="text-skyline text-sm">
          Waiting list is off for every capacity row on{" "}
          {formatShortBusinessDate(pickupDate)}. Enable it on Production
          Capacity. Closing customer orders does not enable the waiting list.
        </p>
      </CardFrame>
    );
  }

  return (
    <CardFrame>
      <p className="text-skyline text-sm">
        Waiting list enabled for {formatShortBusinessDate(pickupDate)}. This is
        not commercial remaining.
      </p>
      <ul className="divide-fog border-fog divide-y overflow-hidden rounded-xl border">
        {enabled.map((row) => (
          <li className="px-4 py-3" key={row.id}>
            <p className="text-ink text-sm font-medium">
              {row.cakeName}
              <span className="text-skyline ml-2 font-normal">
                {row.sizeLabel ?? "All sizes"}
                {row.collectionLabel ? ` · ${row.collectionLabel}` : ""}
              </span>
            </p>
            <p className="text-skyline mt-0.5 text-sm">
              Production capacity {row.quantity} · Waiting list on
            </p>
          </li>
        ))}
      </ul>
    </CardFrame>
  );
}
