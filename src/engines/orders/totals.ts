import { addMoney, fromCents, toCents } from "@/engines/orders/money";
import type {
  StorefrontOrderItem,
  StorefrontPaidAddon,
} from "@/types/storefront";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";

export type CommercialLine = {
  unitPrice: number;
  quantity: number;
};

/** Money-safe line total reducer — cakes, paid add-ons, or concatenated commercial lines. */
export function calculateOrderTotal(
  items: Array<Pick<CommercialLine, "unitPrice" | "quantity">>,
): number {
  return fromCents(
    items.reduce(
      (sum, item) =>
        sum + toCents(Number(item.unitPrice)) * Number(item.quantity),
      0,
    ),
  );
}

/** Whole-cake subtotal from cake order-item snapshots only. */
export function calculateCakeSubtotal(
  items: Array<Pick<StorefrontOrderItem, "unitPrice" | "quantity">>,
): number {
  return calculateOrderTotal(items);
}

/** Paid-add-on subtotal from order-line snapshots only. */
export function calculatePaidAddonSubtotal(
  paidAddons: Array<Pick<StorefrontPaidAddon, "unitPrice" | "quantity">>,
): number {
  return calculateOrderTotal(paidAddons);
}

/** Commercial subtotal = cakes + paid add-ons. */
export function calculateCommercialSubtotal(input: {
  items: Array<Pick<StorefrontOrderItem, "unitPrice" | "quantity">>;
  paidAddons?: Array<Pick<StorefrontPaidAddon, "unitPrice" | "quantity">> | null;
}): number {
  return addMoney(
    calculateCakeSubtotal(input.items),
    calculatePaidAddonSubtotal(normalizePaidAddonLines(input.paidAddons)),
  );
}

/** Normalize missing/legacy paid-add-on collections to []. */
export function normalizePaidAddonLines<T>(
  paidAddons: T[] | null | undefined,
): T[] {
  return Array.isArray(paidAddons) ? paidAddons : [];
}

/** Concatenate cake + paid-add-on lines for settlement / commercial reducers. */
export function commercialLinesForSettlement(input: {
  items: Array<Pick<StorefrontOrderItem, "unitPrice" | "quantity">>;
  paidAddons?: Array<Pick<StorefrontPaidAddon, "unitPrice" | "quantity">> | null;
}): CommercialLine[] {
  const addons = normalizePaidAddonLines(input.paidAddons);
  return [
    ...input.items.map((item) => ({
      unitPrice: Number(item.unitPrice),
      quantity: Number(item.quantity),
    })),
    ...addons.map((item) => ({
      unitPrice: Number(item.unitPrice),
      quantity: Number(item.quantity),
    })),
  ];
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
