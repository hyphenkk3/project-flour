/**
 * M4-P3 2B-1 — Delivery/Processing fee request attribution helpers (pure).
 * Display names must resolve from persisted *_requested_by staff IDs for any
 * authorized viewer — never from the current session identity alone.
 */

import type { StorefrontOrder } from "@/types/storefront";

/**
 * Apply persisted staff display names onto Delivery finance request slots.
 */
export function applyDeliveryFeeRequestStaffNames(
  order: StorefrontOrder,
  namesByStaffId: ReadonlyMap<string, string>,
): StorefrontOrder {
  const delivery = order.delivery;
  if (!delivery) return order;

  const nameFor = (staffId: string | null): string | null => {
    if (!staffId) return null;
    return namesByStaffId.get(staffId) ?? null;
  };

  return {
    ...order,
    delivery: {
      ...delivery,
      deliveryFeeRequest: {
        ...delivery.deliveryFeeRequest,
        requestedByName: nameFor(delivery.deliveryFeeRequest.requestedBy),
        resolvedByName: nameFor(delivery.deliveryFeeRequest.resolvedBy),
      },
      processingFeeRequest: {
        ...delivery.processingFeeRequest,
        requestedByName: nameFor(delivery.processingFeeRequest.requestedBy),
        resolvedByName: nameFor(delivery.processingFeeRequest.resolvedBy),
      },
    },
  };
}

/** UI label for requester — "Staff" only when name is genuinely missing. */
export function feeRequestRequesterLabel(
  requestedByName: string | null | undefined,
): string {
  const trimmed = requestedByName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Staff";
}

/** Resolver label after approve/reject — null when not resolved. */
export function feeRequestResolverLabel(input: {
  status: string | null | undefined;
  resolvedByName: string | null | undefined;
}): string | null {
  const name = input.resolvedByName?.trim();
  if (!name) return null;
  if (input.status === "approved") return `Approved by ${name}`;
  if (input.status === "rejected") return `Rejected by ${name}`;
  if (input.status === "cancelled") return `Cancelled by ${name}`;
  return null;
}

/**
 * Owner/Manager Order Workspace attention copy when fee requests are pending.
 * Returns null when nothing is waiting.
 */
export function pendingFeeRequestAttentionCopy(input: {
  deliveryPending: boolean;
  processingPending: boolean;
  processingKind?: "processing_override" | "processing_waiver" | null;
}): string | null {
  const count =
    (input.deliveryPending ? 1 : 0) + (input.processingPending ? 1 : 0);
  if (count === 0) return null;
  if (count === 2) {
    return "2 fee requests pending — review Delivery Charges below.";
  }
  if (input.deliveryPending) {
    return "Delivery Fee waiver requested — review Delivery Charges below.";
  }
  if (input.processingKind === "processing_override") {
    return "Processing Fee change requested — review Delivery Charges below.";
  }
  return "Processing Fee waiver requested — review Delivery Charges below.";
}
