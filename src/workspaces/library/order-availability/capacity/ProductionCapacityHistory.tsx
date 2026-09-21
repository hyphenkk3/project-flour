"use client";

import { useState } from "react";
import {
  formatCapacityEventSummary,
  formatCapacityEventWhen,
  type ProductionCapacityEvent,
} from "@/workspaces/library/order-availability/capacity/capacity-event-format";

const PREVIEW_COUNT = 8;

type ProductionCapacityHistoryProps = {
  events: ProductionCapacityEvent[];
};

export function ProductionCapacityHistory({
  events,
}: ProductionCapacityHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? events : events.slice(0, PREVIEW_COUNT);
  const hiddenCount = Math.max(0, events.length - PREVIEW_COUNT);

  if (events.length === 0) {
    return (
      <p className="text-skyline text-sm">No capacity changes for this date.</p>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="divide-fog border-fog divide-y overflow-hidden rounded-xl border">
        {visible.map((event) => (
          <li
            className="px-4 py-3"
            key={`${event.createdAt}:${event.cakeName}:${event.newQuantity}`}
          >
            <p className="text-ink text-sm font-medium">
              {formatCapacityEventSummary(event)}
            </p>
            <p className="text-skyline mt-0.5 text-xs">
              {formatCapacityEventWhen(event)}
              {event.actorName ? ` · ${event.actorName}` : ""}
            </p>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <button
          className="border-fog text-ink hover:border-skyline inline-flex min-h-11 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? "Show latest only" : `View all changes (${events.length})`}
        </button>
      ) : null}
    </div>
  );
}
