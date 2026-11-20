import { formatDateTime, formatShortBusinessDate } from "@/lib/dates";
import type { OrderAvailabilityEvent } from "@/workspaces/library/order-availability/queries";

type OrderAvailabilityHistoryProps = {
  events: readonly OrderAvailabilityEvent[];
};

function actionLabel(action: OrderAvailabilityEvent["action"]): string {
  return action === "reopened" ? "Reopened" : "Closed";
}

export function OrderAvailabilityHistory({
  events,
}: OrderAvailabilityHistoryProps) {
  return (
    <details
      aria-labelledby="order-availability-history-heading"
      className="group border-fog rounded-xl border bg-white"
    >
      <summary className="text-ink flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left [&::-webkit-details-marker]:hidden">
        <span
          aria-level={2}
          className="text-ink text-lg font-semibold tracking-tight"
          id="order-availability-history-heading"
          role="heading"
        >
          Recent closures
        </span>
        <span className="text-skyline text-sm font-medium">
          <span className="group-open:hidden">Expand</span>
          <span className="hidden group-open:inline">Collapse</span>
        </span>
      </summary>
      <div className="space-y-3 px-4 pb-4">
        {events.length === 0 ? (
          <p className="text-skyline text-sm">No close or reopen events yet.</p>
        ) : (
          <ul className="divide-fog border-fog divide-y overflow-hidden rounded-xl border">
            {events.map((event) => (
              <li
                className="px-4 py-3"
                key={`${event.createdAt}:${event.pickupDate}:${event.action}`}
              >
                <p className="text-ink text-sm font-medium">
                  {formatShortBusinessDate(event.pickupDate)}
                  <span className="text-skyline ml-2 font-normal">
                    {actionLabel(event.action)}
                  </span>
                </p>
                <p className="text-skyline mt-0.5 text-xs">
                  {formatDateTime(event.createdAt)}
                  {event.actorName ? ` · ${event.actorName}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
