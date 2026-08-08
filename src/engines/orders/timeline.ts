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
  payment_request_prepared: "Payment request prepared",
  payment_request_marked_sent: "Payment request marked as sent",
  payment_deadline_extended: "Payment follow-up deadline extended",
  payment_recorded: "Payment recorded",
  payment_secured: "Paid · Preorder secured",
  august_promo_applied: "August Promo applied",
  rm10_voucher_redeemed: "RM10 Discount Card redeemed",
  rm10_voucher_owner_override: "RM10 Discount Card redeemed (Owner override)",
  discount_removed: "Discount removed",
  discount_changed: "Discount changed",
  order_marked_ready: "Marked ready",
  order_ready_undone: "Ready undone",
  order_picked_up: "Marked picked up",
  order_picked_up_undone: "Picked up undone",
  staff_preorder_created: "Staff preorder created",
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
