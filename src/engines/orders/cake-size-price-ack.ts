/**
 * Customer quote vs pickup-date cake-size price acknowledgement.
 * Authoritative charge remains SQL library_cake_size_price_on at submit.
 */

import { moneyCompare } from "@/engines/orders/money";

export const CAKE_PRICE_ACK_STALE_MESSAGE =
  "The prices for your selected pickup date have changed. Please review the updated prices.";

export const CAKE_PRICE_ACK_REQUIRED_MESSAGE =
  "Please confirm you accept the updated prices for your selected pickup date.";

export type CakePriceQuotedItem = {
  cakeId?: string;
  sizeId: string;
  cakeName?: string;
  sizeLabel?: string;
  quantity?: number;
  unitPrice: number;
  quotedUnitPrice?: number;
  applicableUnitPrice?: number;
};

export type CakePriceChangeLine = {
  sizeId: string;
  cakeName: string;
  sizeLabel: string;
  quantity: number;
  quotedUnitPrice: number;
  applicableUnitPrice: number;
};

export type CakePriceAckLine = {
  cake_size_id: string;
  quoted_unit_price: number;
  acknowledged_unit_price: number;
};

export type CakePriceAckPayload = {
  pickup_date: string;
  lines: CakePriceAckLine[];
};

export function quotedDraftItemUnitPrice(item: CakePriceQuotedItem): number {
  if (
    typeof item.quotedUnitPrice === "number" &&
    Number.isFinite(item.quotedUnitPrice)
  ) {
    return item.quotedUnitPrice;
  }
  return Number.isFinite(item.unitPrice) ? item.unitPrice : 0;
}

/** Pickup-date price when resolved; otherwise the preserved add-time quote. */
export function chargedDraftItemUnitPrice(item: CakePriceQuotedItem): number {
  if (
    typeof item.applicableUnitPrice === "number" &&
    Number.isFinite(item.applicableUnitPrice)
  ) {
    return item.applicableUnitPrice;
  }
  return quotedDraftItemUnitPrice(item);
}

export function cakeSizePricesDiffer(
  quoted: number,
  applicable: number,
): boolean {
  return moneyCompare(quoted, applicable) !== 0;
}

export function cakePriceChangeLines(
  items: readonly CakePriceQuotedItem[],
): CakePriceChangeLine[] {
  const lines: CakePriceChangeLine[] = [];
  for (const item of items) {
    if (typeof item.applicableUnitPrice !== "number") continue;
    const quoted = quotedDraftItemUnitPrice(item);
    if (!cakeSizePricesDiffer(quoted, item.applicableUnitPrice)) continue;
    lines.push({
      sizeId: item.sizeId,
      cakeName: item.cakeName?.trim() || "Cake",
      sizeLabel: item.sizeLabel?.trim() || "",
      quantity: Math.max(1, Number(item.quantity) || 1),
      quotedUnitPrice: quoted,
      applicableUnitPrice: item.applicableUnitPrice,
    });
  }
  return lines;
}

export function cakePriceAckRequired(
  items: readonly CakePriceQuotedItem[],
): boolean {
  return cakePriceChangeLines(items).length > 0;
}

/** Deterministic snapshot of changed cake-size prices for the selected date. */
export function cakePriceAckSnapshot(input: {
  pickupDate: string;
  items: readonly CakePriceQuotedItem[];
}): string {
  const pickupDate = input.pickupDate.trim().slice(0, 10);
  const changed = cakePriceChangeLines(input.items)
    .slice()
    .sort((left, right) => left.sizeId.localeCompare(right.sizeId))
    .map(
      (line) =>
        `${line.sizeId}:${Math.round(line.quotedUnitPrice * 100)}:${Math.round(line.applicableUnitPrice * 100)}`,
    );
  return `${pickupDate}|${changed.join(",")}`;
}

export function cakePriceAckSatisfied(input: {
  pickupDate: string;
  items: readonly CakePriceQuotedItem[];
  acknowledgedSnapshot: string;
}): boolean {
  if (!cakePriceAckRequired(input.items)) return true;
  return (
    input.acknowledgedSnapshot ===
    cakePriceAckSnapshot({
      pickupDate: input.pickupDate,
      items: input.items,
    })
  );
}

export function buildCakePriceAckPayload(input: {
  pickupDate: string;
  items: readonly CakePriceQuotedItem[];
}): CakePriceAckPayload {
  return {
    pickup_date: input.pickupDate.trim().slice(0, 10),
    lines: input.items.map((item) => ({
      cake_size_id: item.sizeId,
      quoted_unit_price: quotedDraftItemUnitPrice(item),
      acknowledged_unit_price: chargedDraftItemUnitPrice(item),
    })),
  };
}

export function applyApplicableUnitPrices<T extends CakePriceQuotedItem>(
  items: readonly T[],
  priceBySizeId: Readonly<Record<string, number>>,
): T[] {
  let changed = false;
  const next = items.map((item) => {
    const applicable = priceBySizeId[item.sizeId];
    if (typeof applicable !== "number" || !Number.isFinite(applicable)) {
      if (item.applicableUnitPrice === undefined) return item;
      changed = true;
      const copy = { ...item };
      delete copy.applicableUnitPrice;
      return copy;
    }
    if (item.applicableUnitPrice === applicable) return item;
    changed = true;
    return { ...item, applicableUnitPrice: applicable };
  });
  return changed ? next : (items as T[]);
}

export function isCakePriceAckStaleError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /prices for your selected pickup date have changed/i.test(message);
}
