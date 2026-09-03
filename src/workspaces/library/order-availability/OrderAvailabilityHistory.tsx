import {
  formatDateTime,
  formatShortBusinessDate,
} from "@/lib/dates";
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
    <section aria-labelledby="order-availability-history-heading" className="space-y-3">
      <h2
        className="text-ink text-lg font-semibold tracking-tight"
        id="order-availability-history-heading"
      >
        Recent closures
      </h2>
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
    </section>
  );
}
