/**
 * Ephemeral Slice 3 acknowledgement for Delivery Fee NOT SET.
 * sessionStorage only — never persist to DB / mutate finance.
 */

import { DELIVERY_CHARGES_SECTION_ID } from "@/engines/orders/delivery-finance";
import { scrollWorkspaceSectionIntoView } from "@/workspaces/owner/orders/scroll-workspace-section";

const ACK_KEY_PREFIX = "wb-conf-missing-df-ack:";

export function missingDeliveryFeeConfirmationAckKey(orderId: string): string {
  return `${ACK_KEY_PREFIX}${orderId}`;
}

export function acknowledgeMissingDeliveryFeeBeforeConfirmation(
  orderId: string,
): void {
  try {
    sessionStorage.setItem(missingDeliveryFeeConfirmationAckKey(orderId), "1");
  } catch {
    // sessionStorage unavailable — React state still covers this attempt.
  }
}

export function hasAcknowledgedMissingDeliveryFeeBeforeConfirmation(
  orderId: string,
): boolean {
  try {
    return (
      sessionStorage.getItem(missingDeliveryFeeConfirmationAckKey(orderId)) ===
      "1"
    );
  } catch {
    return false;
  }
}

export function deliveryChargesSectionHref(workspaceHref: string): string {
  const hashIndex = workspaceHref.indexOf("#");
  const base = hashIndex >= 0 ? workspaceHref.slice(0, hashIndex) : workspaceHref;
  return `${base}#${DELIVERY_CHARGES_SECTION_ID}`;
}

export function focusDeliveryChargesSection(): void {
  scrollWorkspaceSectionIntoView(DELIVERY_CHARGES_SECTION_ID, { focus: true });
}
