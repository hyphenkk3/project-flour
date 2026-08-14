/**
 * Guest-order operational lifecycle — independent of financial order_status.
 *
 * Pickup: picked up > ready > not ready (ready_at / picked_up_at).
 * Delivery: delivered > out for delivery > ready > not ready
 *   (ready_at / out_for_delivery_at / delivered_at).
 * Delivery must never derive state from picked_up_at.
 */

import type { StorefrontOrderFulfilmentMethod } from "@/types/storefront";

export type OperationalState =
  | "not_ready"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "picked_up";

export type OperationalTimestamps = {
  readyAt: string | null;
  pickedUpAt: string | null;
  outForDeliveryAt?: string | null;
  deliveredAt?: string | null;
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod | null;
};

export function isDeliveryFulfilment(
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod | null,
): boolean {
  return fulfilmentMethod === "delivery";
}

export function deriveOperationalState(
  input: OperationalTimestamps,
): OperationalState {
  if (isDeliveryFulfilment(input.fulfilmentMethod)) {
    if (input.deliveredAt) return "delivered";
    if (input.outForDeliveryAt) return "out_for_delivery";
    if (input.readyAt) return "ready";
    return "not_ready";
  }
  if (input.pickedUpAt) return "picked_up";
  if (input.readyAt) return "ready";
  return "not_ready";
}

/** Workspace / Quick View operational section title. */
export function operationalSectionTitle(
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod | null,
): "Collection" | "Delivery" {
  return isDeliveryFulfilment(fulfilmentMethod) ? "Delivery" : "Collection";
}

export function operationalStateLabel(
  state: OperationalState,
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod | null,
): string {
  switch (state) {
    case "not_ready":
      return "Not Ready";
    case "ready":
      return "Ready";
    case "out_for_delivery":
      return "Out for Delivery";
    case "delivered":
      return "Delivered";
    case "picked_up":
      return "Picked Up";
  }
}

export function operationalCompleteActionLabel(
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod | null,
): "Mark Delivered" | "Mark Picked Up" {
  return isDeliveryFulfilment(fulfilmentMethod)
    ? "Mark Delivered"
    : "Mark Picked Up";
}

export function operationalUndoCompleteActionLabel(
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod | null,
): "Undo Delivered" | "Undo Picked Up" {
  return isDeliveryFulfilment(fulfilmentMethod)
    ? "Undo Delivered"
    : "Undo Picked Up";
}

export function operationalCompletedAtPrefix(
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod | null,
): "Delivered at" | "Picked up at" {
  return isDeliveryFulfilment(fulfilmentMethod)
    ? "Delivered at"
    : "Picked up at";
}

export const MARK_OUT_FOR_DELIVERY_LABEL = "Mark Out for Delivery";
export const UNDO_OUT_FOR_DELIVERY_LABEL = "Undo Out for Delivery";

/** Calendar scan markers. Pickup: ● Ready / ✓ Picked Up. Delivery: ● Ready / ○ Out / ✓ Delivered. */
export function operationalStateMarker(
  state: OperationalState,
): "" | "●" | "○" | "✓" {
  switch (state) {
    case "delivered":
    case "picked_up":
      return "✓";
    case "out_for_delivery":
      return "○";
    case "ready":
      return "●";
    case "not_ready":
      return "";
  }
}

export function operationalMarkerFromTimestamps(
  input: OperationalTimestamps,
): "" | "●" | "○" | "✓" {
  return operationalStateMarker(deriveOperationalState(input));
}

/**
 * Fulfilment is complete for Owner attention cutoffs.
 * Pickup → picked_up; Delivery → delivered.
 * out_for_delivery is NOT terminal.
 */
export function isFulfilmentTerminal(input: OperationalTimestamps): boolean {
  const state = deriveOperationalState(input);
  return state === "picked_up" || state === "delivered";
}

/** Prefix display name with ● / ○ / ✓ when present. */
export function withOperationalMarker(
  displayName: string,
  input: OperationalTimestamps,
): string {
  const marker = operationalMarkerFromTimestamps(input);
  return marker ? `${marker} ${displayName}` : displayName;
}
