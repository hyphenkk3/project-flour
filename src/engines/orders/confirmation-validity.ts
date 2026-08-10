import { moneyCompare } from "@/engines/orders/money";
import { paidAddonsMateriallyDiffer } from "@/engines/orders/paid-addons";
import type { GuestOrderStatus, StorefrontOrder } from "@/types/storefront";

/** Fields that appear in the customer-facing confirmation message. */
export function orderMateriallyAffectsConfirmation(
  before: StorefrontOrder,
  after: {
    customerName: string;
    phone: string;
    pickupDate: string;
    pickupTime: string;
    items: Array<{
      cakeId: string;
      cakeSizeId: string;
      quantity: number;
      unitPrice: number;
      cakeName: string;
      sizeLabel: string;
    }>;
    complimentaryItems: Array<{ name: string; quantity: number }>;
    paidAddons?: Array<{
      code: string;
      quantity: number;
      unitPrice?: number;
      name?: string;
      financialShorthand?: string;
      writtenMessage?: string | null;
      messages?: Array<{
        cardIndex: number;
        writtenMessage: string | null;
      }> | Array<string | null>;
    }>;
  },
): boolean {
  if (before.customerName.trim() !== after.customerName.trim()) return true;
  if (before.phone.trim() !== after.phone.trim()) return true;
  if (before.pickupDate !== after.pickupDate) return true;
  if (normalizeTime(before.pickupTime) !== normalizeTime(after.pickupTime)) {
    return true;
  }

  const beforeItems = serializeItems(before.items);
  const afterItems = serializeItems(after.items);
  if (beforeItems !== afterItems) return true;

  const beforeComp = serializeComplimentary(before.complimentaryItems);
  const afterComp = serializeComplimentary(after.complimentaryItems);
  if (beforeComp !== afterComp) return true;

  if (
    paidAddonsMateriallyDiffer(before.paidAddons ?? [], after.paidAddons ?? [])
  ) {
    return true;
  }

  return false;
}

/** Amount due change that customers would have confirmed. */
export function financialMateriallyAffectsConfirmation(
  beforeAmountDue: number,
  afterAmountDue: number,
): boolean {
  return moneyCompare(beforeAmountDue, afterAmountDue) !== 0;
}

/**
 * Statuses where a previously sent confirmation can become stale.
 * Does NOT include `submitted` (no confirmation sent yet → no false outdated).
 * Payment lifecycle status is intentionally independent of confirmation validity.
 */
export function orderStatusAllowsConfirmationInvalidation(
  status: GuestOrderStatus,
): boolean {
  return (
    status === "pending_confirmation" ||
    status === "awaiting_payment" ||
    status === "paid"
  );
}

/** Material change should outdate a prior sent confirmation. */
export function shouldOutdateSentConfirmation(input: {
  materialChange: boolean;
  orderStatus: GuestOrderStatus;
}): boolean {
  return (
    input.materialChange &&
    orderStatusAllowsConfirmationInvalidation(input.orderStatus)
  );
}

/**
 * Staff may open Customer Confirmation preview / Mark as Sent when:
 * - first send (submitted), or
 * - waiting first customer confirm (pending_confirmation), or
 * - previously confirmed order needs reconfirmation while still in payment lifecycle
 *   (awaiting_payment / paid + confirmationNeedsResend).
 */
export function canAccessCustomerConfirmation(input: {
  status: GuestOrderStatus;
  confirmationNeedsResend: boolean;
}): boolean {
  if (input.status === "submitted" || input.status === "pending_confirmation") {
    return true;
  }
  if (
    (input.status === "awaiting_payment" || input.status === "paid") &&
    input.confirmationNeedsResend
  ) {
    return true;
  }
  return false;
}

/** Show "Prepare Updated Confirmation" (vs first Prepare Confirmation). */
export function shouldOfferUpdatedConfirmationAction(input: {
  status: GuestOrderStatus;
  confirmationNeedsResend: boolean;
}): boolean {
  if (!input.confirmationNeedsResend) return false;
  return (
    input.status === "pending_confirmation" ||
    input.status === "awaiting_payment" ||
    input.status === "paid"
  );
}

/**
 * Mark-as-sent must not roll Awaiting Payment / Paid back to Pending Confirmation.
 * Only first send from Submitted advances into Pending Confirmation.
 */
export function nextStatusAfterConfirmationMarkedSent(
  current: GuestOrderStatus,
): GuestOrderStatus {
  if (current === "submitted") return "pending_confirmation";
  return current;
}

function normalizeTime(value: string): string {
  const parts = value.split(":");
  if (parts.length < 2) return value;
  return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
}

function serializeItems(
  items: Array<{
    cakeId: string;
    cakeSizeId: string;
    quantity: number;
    unitPrice: number;
    cakeName: string;
    sizeLabel: string;
  }>,
): string {
  return [...items]
    .map((item) =>
      [
        item.cakeId,
        item.cakeSizeId,
        item.quantity,
        Number(item.unitPrice).toFixed(2),
        item.cakeName,
        item.sizeLabel,
      ].join("|"),
    )
    .sort()
    .join(";");
}

function serializeComplimentary(
  items: Array<{ name: string; quantity: number }>,
): string {
  return [...items]
    .filter((item) => item.quantity > 0)
    .map((item) => `${item.name}|${item.quantity}`)
    .sort()
    .join(";");
}
