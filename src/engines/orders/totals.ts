import type { StorefrontOrderItem } from "@/types/storefront";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";

export function calculateOrderTotal(
  items: Array<Pick<StorefrontOrderItem, "unitPrice" | "quantity">>,
): number {
  return items.reduce(
    (sum, item) => sum + Number(item.unitPrice) * Number(item.quantity),
    0,
  );
}

export function formatOrderTotal(total: number): string {
  return formatRm(total);
}

/** Consolidate identical cake+size lines by summing quantity. */
export function consolidateDraftItems<
  T extends { cakeId: string; sizeId: string; quantity: number },
>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = `${item.cakeId}::${item.sizeId}`;
    const existing = map.get(key);
    if (existing) {
      map.set(key, {
        ...existing,
        quantity: existing.quantity + item.quantity,
      });
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}
