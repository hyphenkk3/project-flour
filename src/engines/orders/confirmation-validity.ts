import type { StorefrontOrder } from "@/types/storefront";

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

  return false;
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
