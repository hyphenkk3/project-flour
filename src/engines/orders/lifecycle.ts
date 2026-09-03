/**
 * Phase 8 — business-facing Whole Cake order lifecycle.
 *
 * Does not add a parallel DB field. Derives from existing commercial
 * `orders.status` plus operational timestamps
 * (`production_started_at`, `ready_at`, `picked_up_at`, `delivered_at`).
 */

import type { StatusTone } from "@/lib/design-tokens";
import type { RoleCode } from "@/types/staff";

export type OrderLifecycleStage =
  | "cancelled"
  | "completed"
  | "ready_for_collection"
  | "preparing"
  | "paid_confirmed"
  | "payment_pending";

export type OrderLifecycleSnapshot = {
  status: string;
  productionStartedAt?: string | null;
  readyAt?: string | null;
  pickedUpAt?: string | null;
  outForDeliveryAt?: string | null;
  deliveredAt?: string | null;
};

export const LIFECYCLE_STAGE_LABELS: Record<OrderLifecycleStage, string> = {
  payment_pending: "Payment Pending",
  paid_confirmed: "Paid / Confirmed",
  preparing: "Preparing",
  ready_for_collection: "Ready for Collection",
  completed: "Completed / Collected",
  cancelled: "Cancelled",
};

export const LIFECYCLE_ERRORS = {
  cancelled:
    "Cancelled orders cannot continue in the normal lifecycle.",
  cancelledPayment: "Payment cannot be confirmed on a cancelled order.",
  cancelledResume: "Cancelled orders cannot resume the normal lifecycle.",
  unpaidReady: "Unpaid orders cannot be marked Ready for Collection.",
  notStartedReady: "Start production before marking this order Ready.",
  alreadyReady: "Order is already marked ready.",
  alreadyComplete: "This order is already completed.",
  completeBeforeReady:
    "This order is not Ready for Collection. Manager or Owner override is required.",
  notPreparing:
    "Only confirmed or awaiting-payment orders can start production.",
  waitingConfirmation:
    "Waiting for customer confirmation before production can start.",
  notAuthorized: "Not authorized for this lifecycle action.",
} as const;

export function isGuestOrderCancelled(status: string): boolean {
  return status === "cancelled";
}

export function isGuestOrderPaid(status: string): boolean {
  return status === "paid";
}

export function isGuestOrderComplete(input: OrderLifecycleSnapshot): boolean {
  return Boolean(input.pickedUpAt || input.deliveredAt);
}

export function deriveOrderLifecycleStage(
  input: OrderLifecycleSnapshot,
): OrderLifecycleStage {
  if (isGuestOrderCancelled(input.status)) return "cancelled";
  if (isGuestOrderComplete(input)) return "completed";
  if (input.readyAt) return "ready_for_collection";
  if (input.productionStartedAt) return "preparing";
  if (isGuestOrderPaid(input.status)) return "paid_confirmed";
  return "payment_pending";
}

export function orderLifecycleLabel(input: OrderLifecycleSnapshot): string {
  return LIFECYCLE_STAGE_LABELS[deriveOrderLifecycleStage(input)];
}

export function orderLifecycleBadgeTone(
  stage: OrderLifecycleStage,
): StatusTone {
  switch (stage) {
    case "cancelled":
      return "danger";
    case "completed":
      return "success";
    case "ready_for_collection":
      return "success";
    case "preparing":
      return "warning";
    case "paid_confirmed":
      return "success";
    case "payment_pending":
      return "progress";
  }
}

export function canCancelGuestOrderRole(role: RoleCode): boolean {
  return (
    role === "owner" ||
    role === "manager" ||
    role === "customer_operations"
  );
}

export function canDuplicateGuestOrderRole(role: RoleCode): boolean {
  return canCancelGuestOrderRole(role);
}

export function canConfirmGuestPaymentRole(role: RoleCode): boolean {
  return canCancelGuestOrderRole(role);
}

export function canOverrideUnpaidReadyRole(role: RoleCode): boolean {
  return role === "owner" || role === "manager";
}

export function canOverrideCompleteBeforeReadyRole(role: RoleCode): boolean {
  return role === "owner" || role === "manager";
}

export function canStartGuestProduction(
  input: OrderLifecycleSnapshot,
  role: RoleCode,
): { ok: true } | { ok: false; error: string } {
  if (
    role !== "bakery" &&
    role !== "manager" &&
    role !== "owner"
  ) {
    return { ok: false, error: LIFECYCLE_ERRORS.notAuthorized };
  }
  if (isGuestOrderCancelled(input.status)) {
    return { ok: false, error: LIFECYCLE_ERRORS.cancelled };
  }
  if (isGuestOrderComplete(input)) {
    return { ok: false, error: LIFECYCLE_ERRORS.alreadyComplete };
  }
  if (input.readyAt) {
    return { ok: false, error: LIFECYCLE_ERRORS.alreadyReady };
  }
  if (input.status === "submitted" || input.status === "pending_confirmation") {
    return { ok: false, error: LIFECYCLE_ERRORS.waitingConfirmation };
  }
  if (input.status === "awaiting_payment" || input.status === "paid") {
    return { ok: true };
  }
  return { ok: false, error: LIFECYCLE_ERRORS.notPreparing };
}

export function canMarkGuestOrderReady(input: {
  snapshot: OrderLifecycleSnapshot;
  role: RoleCode;
  /** Bakery requires Start first and paid status. Owner Ops may skip Start. */
  surface: "bakery" | "owner";
}): { ok: true } | { ok: false; error: string } {
  const { snapshot, role, surface } = input;
  if (isGuestOrderCancelled(snapshot.status)) {
    return { ok: false, error: LIFECYCLE_ERRORS.cancelled };
  }
  if (isGuestOrderComplete(snapshot)) {
    return { ok: false, error: LIFECYCLE_ERRORS.alreadyComplete };
  }
  if (snapshot.readyAt) {
    return { ok: false, error: LIFECYCLE_ERRORS.alreadyReady };
  }

  const unpaid = snapshot.status !== "paid";
  if (unpaid) {
    if (surface === "bakery" || !canOverrideUnpaidReadyRole(role)) {
      return { ok: false, error: LIFECYCLE_ERRORS.unpaidReady };
    }
  }

  if (surface === "bakery" && !snapshot.productionStartedAt) {
    return { ok: false, error: LIFECYCLE_ERRORS.notStartedReady };
  }

  if (surface === "bakery") {
    if (role !== "bakery" && role !== "manager" && role !== "owner") {
      return { ok: false, error: LIFECYCLE_ERRORS.notAuthorized };
    }
  } else if (role !== "owner" && role !== "manager") {
    return { ok: false, error: LIFECYCLE_ERRORS.notAuthorized };
  }

  return { ok: true };
}

export function canCompleteGuestOrder(input: {
  snapshot: OrderLifecycleSnapshot;
  role: RoleCode;
  /** Collection desk is Ready-gated. Ops allows Owner/Manager override. */
  surface: "collection" | "ops";
}): { ok: true } | { ok: false; error: string } {
  const { snapshot, role, surface } = input;
  if (isGuestOrderCancelled(snapshot.status)) {
    return { ok: false, error: LIFECYCLE_ERRORS.cancelled };
  }
  if (isGuestOrderComplete(snapshot)) {
    return { ok: false, error: LIFECYCLE_ERRORS.alreadyComplete };
  }
  if (snapshot.readyAt) return { ok: true };
  if (
    surface === "ops" &&
    canOverrideCompleteBeforeReadyRole(role)
  ) {
    return { ok: true };
  }
  return { ok: false, error: LIFECYCLE_ERRORS.completeBeforeReady };
}

export function canConfirmGuestPayment(
  snapshot: OrderLifecycleSnapshot,
  role: RoleCode,
): { ok: true } | { ok: false; error: string } {
  if (!canConfirmGuestPaymentRole(role)) {
    return { ok: false, error: LIFECYCLE_ERRORS.notAuthorized };
  }
  if (isGuestOrderCancelled(snapshot.status)) {
    return { ok: false, error: LIFECYCLE_ERRORS.cancelledPayment };
  }
  if (snapshot.status !== "awaiting_payment") {
    return {
      ok: false,
      error: "Payments can only be recorded while awaiting payment.",
    };
  }
  return { ok: true };
}

export function canCancelGuestOrder(input: {
  snapshot: OrderLifecycleSnapshot;
  role: RoleCode;
}): { ok: true } | { ok: false; error: string } {
  const { snapshot, role } = input;
  if (!canCancelGuestOrderRole(role)) {
    return { ok: false, error: LIFECYCLE_ERRORS.notAuthorized };
  }
  if (isGuestOrderCancelled(snapshot.status)) {
    return { ok: false, error: "Order is already cancelled." };
  }
  if (
    isGuestOrderComplete(snapshot) &&
    !canOverrideCompleteBeforeReadyRole(role)
  ) {
    return {
      ok: false,
      error: "Completed orders cannot be cancelled without Manager or Owner override.",
    };
  }
  return { ok: true };
}

export function duplicateOrderResetsLifecycle(): {
  status: "submitted";
  paymentStatus: "unpaid";
  productionStartedAt: null;
  readyAt: null;
  pickedUpAt: null;
  deliveredAt: null;
} {
  return {
    status: "submitted",
    paymentStatus: "unpaid",
    productionStartedAt: null,
    readyAt: null,
    pickedUpAt: null,
    deliveredAt: null,
  };
}
