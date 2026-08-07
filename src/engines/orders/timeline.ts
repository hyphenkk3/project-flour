import type { OrderTimelineEventType } from "@/types/storefront";

export const TIMELINE_EVENT_LABELS: Record<string, string> = {
  preorder_submitted: "Preorder submitted",
  order_updated: "Order updated",
  confirmation_prepared: "Confirmation prepared",
  confirmation_marked_sent: "Confirmation marked as sent",
  confirmation_outdated: "Previous confirmation became outdated",
  updated_confirmation_prepared: "Updated confirmation prepared",
  updated_confirmation_marked_sent: "Updated confirmation marked as sent",
  customer_confirmed: "Customer confirmed",
};

export function timelineEventLabel(eventType: string): string {
  return TIMELINE_EVENT_LABELS[eventType] ?? eventType;
}

export type TimelineActor = {
  staffId: string | null;
  name: string | null;
};

export function describeTimelineActor(
  eventType: OrderTimelineEventType | string,
  actorName: string | null,
): string {
  if (eventType === "preorder_submitted" && !actorName) {
    return "Customer";
  }
  return actorName ?? "Staff";
}
