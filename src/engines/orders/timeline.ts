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
  order_production_started: "Production started",
  order_production_start_undone: "Production start undone",
  order_marked_ready: "Marked ready",
  order_ready_undone: "Ready undone",
  order_picked_up: "Marked picked up",
  order_picked_up_undone: "Picked up undone",
  order_out_for_delivery: "Marked out for delivery",
  order_out_for_delivery_undone: "Out for delivery undone",
  order_delivered: "Marked delivered",
  order_delivered_undone: "Delivered undone",
  staff_preorder_created: "Staff preorder created",
  operations_approval_requested: "Approval requested",
  operations_approval_approved: "Approval approved",
  operations_approval_rejected: "Approval rejected",
  operations_approval_cancelled: "Approval cancelled",
  delivery_finance_initialized: "Delivery charges enabled",
  delivery_fee_quoted: "Delivery fee quoted",
  delivery_fee_waived: "Delivery fee waived",
  delivery_fee_restored: "Delivery fee restored",
  delivery_fee_waiver_requested: "Delivery fee waiver requested",
  delivery_fee_waiver_approved: "Delivery fee waiver approved",
  delivery_fee_waiver_rejected: "Delivery fee waiver rejected",
  delivery_fee_waiver_request_cancelled: "Delivery fee waiver request cancelled",
  delivery_processing_fee_overridden: "Processing fee overridden",
  delivery_processing_fee_waived: "Processing fee waived",
  delivery_processing_fee_restored: "Processing fee restored",
  delivery_processing_fee_change_requested: "Processing fee change requested",
  delivery_processing_fee_request_approved: "Processing fee request approved",
  delivery_processing_fee_request_rejected: "Processing fee request rejected",
  delivery_processing_fee_request_cancelled:
    "Processing fee request cancelled",
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
