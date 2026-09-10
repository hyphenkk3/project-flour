import { isValidExtraCustomerPickup } from "@/engines/extra/extra-pickup";
import {
  FRESH_PICKS_ALREADY_IN_CART,
  FRESH_PICKS_CART_PICKUP_MISMATCH,
  FRESH_PICKS_CART_UNAVAILABLE_FOR_PICKUP,
} from "@/engines/extra/customer-fresh-picks";
import type { PhysicalReceiptChoice } from "@/workspaces/storefront/checkout/preorder-draft";

export const FRESH_PICK_CART_KEY = "whitebird-fresh-pick-cart-v1";
export const FRESH_PICK_CART_CHANGED_EVENT = "whitebird-fresh-pick-cart-changed";
export const FRESH_PICK_CART_OPEN_EVENT = "whitebird-open-fresh-pick-cart";

export type FreshPickCartItem = {
  extraStockId: string;
  cakeName: string;
  sizeLabel: string;
  unitPrice: number | null;
  imageUrl: string | null;
  pickupDate: string;
  pickupTime: string;
};

export type FreshPickCart = {
  pickupDate: string;
  pickupTime: string;
  items: FreshPickCartItem[];
  customerName: string;
  phone: string;
  includeReceiptChoice: PhysicalReceiptChoice;
  notes: string;
  complimentaryCodes: string[];
  paidAddonCodes: string[];
  birthdayCardMessage: string;
  wishingCardMessage: string;
};

export type FreshPickCartAddInput = {
  extraStockId: string;
  cakeName: string;
  sizeLabel: string;
  unitPrice: number | null;
  imageUrl: string | null;
  pickupDate: string;
  pickupTime: string;
  pickupAvailableFromAt: string;
  orderCutoffAt: string;
};

export type FreshPickCartAddResult =
  | { ok: true; cart: FreshPickCart; added: boolean }
  | { ok: false; error: string };

export function emptyFreshPickCart(): FreshPickCart {
  return {
    pickupDate: "",
    pickupTime: "",
    items: [],
    customerName: "",
    phone: "",
    includeReceiptChoice: "",
    notes: "",
    complimentaryCodes: [],
    paidAddonCodes: [],
    birthdayCardMessage: "",
    wishingCardMessage: "",
  };
}

function emitFreshPickCartChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FRESH_PICK_CART_CHANGED_EVENT));
}

export function openFreshPickCart(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FRESH_PICK_CART_OPEN_EVENT));
}

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim().slice(0, 10));
}

function isHm(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value.trim());
}

function parseItem(value: unknown): FreshPickCartItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const extraStockId = String(row.extraStockId ?? "").trim();
  const cakeName = String(row.cakeName ?? "").trim();
  const sizeLabel = String(row.sizeLabel ?? "").trim();
  const pickupDate = String(row.pickupDate ?? "").trim().slice(0, 10);
  const pickupTime = String(row.pickupTime ?? "").trim().slice(0, 5);
  if (!extraStockId || !cakeName || !isYmd(pickupDate) || !isHm(pickupTime)) {
    return null;
  }
  const unitPrice =
    typeof row.unitPrice === "number" && Number.isFinite(row.unitPrice)
      ? row.unitPrice
      : row.unitPrice == null
        ? null
        : Number(row.unitPrice);
  return {
    extraStockId,
    cakeName,
    sizeLabel,
    unitPrice: unitPrice != null && Number.isFinite(unitPrice) ? unitPrice : null,
    imageUrl:
      typeof row.imageUrl === "string" && row.imageUrl.trim()
        ? row.imageUrl
        : null,
    pickupDate,
    pickupTime,
  };
}

export function parseFreshPickCart(value: unknown): FreshPickCart | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.items)) return null;
  const items = row.items
    .map(parseItem)
    .filter((item): item is FreshPickCartItem => item != null);
  const pickupDate = String(row.pickupDate ?? "").trim().slice(0, 10);
  const pickupTime = String(row.pickupTime ?? "").trim().slice(0, 5);
  const receipt = String(row.includeReceiptChoice ?? "");
  return {
    pickupDate: isYmd(pickupDate) ? pickupDate : items[0]?.pickupDate ?? "",
    pickupTime: isHm(pickupTime) ? pickupTime : items[0]?.pickupTime ?? "",
    items,
    customerName: String(row.customerName ?? ""),
    phone: String(row.phone ?? ""),
    includeReceiptChoice: receipt === "yes" || receipt === "no" ? receipt : "",
    notes: String(row.notes ?? ""),
    complimentaryCodes: Array.isArray(row.complimentaryCodes)
      ? row.complimentaryCodes.map((code) => String(code))
      : [],
    paidAddonCodes: Array.isArray(row.paidAddonCodes)
      ? row.paidAddonCodes.map((code) => String(code))
      : [],
    birthdayCardMessage: String(row.birthdayCardMessage ?? ""),
    wishingCardMessage: String(row.wishingCardMessage ?? ""),
  };
}

export function readFreshPickCart(): FreshPickCart | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FRESH_PICK_CART_KEY);
    if (!raw) return null;
    return parseFreshPickCart(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeFreshPickCart(cart: FreshPickCart): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(FRESH_PICK_CART_KEY, JSON.stringify(cart));
  emitFreshPickCartChanged();
}

export function clearFreshPickCart(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(FRESH_PICK_CART_KEY);
  emitFreshPickCartChanged();
}

export function freshPickCartHasItems(cart: FreshPickCart | null): boolean {
  return Boolean(cart && cart.items.length > 0);
}

export function freshPickCartHasExtra(
  cart: FreshPickCart | null | undefined,
  extraStockId: string,
): boolean {
  const id = extraStockId.trim();
  if (!id || !cart) return false;
  return cart.items.some((item) => item.extraStockId === id);
}

/**
 * Catalogue CTA for a grouped offering: Add to Cart while any exact unit is
 * still unselected; otherwise ✓ Added to Cart. Target id is the first remaining
 * extra_stock.id, so Continue Shopping can add a sibling unit.
 */
export function freshPickCatalogueCtaState(
  extraStockIds: readonly string[],
  cart: FreshPickCart | null | undefined,
): { extraStockId: string | null; addedToCart: boolean } {
  const ids = extraStockIds.map((id) => id.trim()).filter(Boolean);
  const remaining = ids.filter((id) => !freshPickCartHasExtra(cart, id));
  if (remaining.length > 0) {
    return { extraStockId: remaining[0] ?? null, addedToCart: false };
  }
  return { extraStockId: ids[0] ?? null, addedToCart: ids.length > 0 };
}

export function freshPickCartCount(cart: FreshPickCart | null): number {
  return cart?.items.length ?? 0;
}

export function freshPickCartTotal(cart: FreshPickCart | null): number {
  if (!cart) return 0;
  return cart.items.reduce((sum, item) => sum + (item.unitPrice ?? 0), 0);
}

export function extraIsValidForCartPickup(input: {
  pickupDate: string;
  pickupTime: string;
  pickupAvailableFromAt: string;
  orderCutoffAt: string;
  now?: Date;
}): boolean {
  return isValidExtraCustomerPickup({
    pickupDate: input.pickupDate,
    pickupTime: input.pickupTime,
    pickupAvailableFromAt: input.pickupAvailableFromAt,
    orderCutoffAt: input.orderCutoffAt,
    now: input.now,
  });
}

export function addFreshPickToCart(
  cart: FreshPickCart | null,
  input: FreshPickCartAddInput,
  now?: Date,
): FreshPickCartAddResult {
  const extraStockId = input.extraStockId.trim();
  if (!extraStockId) {
    return { ok: false, error: "Extra is required" };
  }
  if (
    !extraIsValidForCartPickup({
      pickupDate: input.pickupDate,
      pickupTime: input.pickupTime,
      pickupAvailableFromAt: input.pickupAvailableFromAt,
      orderCutoffAt: input.orderCutoffAt,
      now,
    })
  ) {
    return { ok: false, error: "Please choose a valid pickup time for that date." };
  }

  const current = cart ?? emptyFreshPickCart();
  if (current.items.some((item) => item.extraStockId === extraStockId)) {
    return { ok: false, error: FRESH_PICKS_ALREADY_IN_CART };
  }

  if (current.items.length > 0) {
    if (
      current.pickupDate !== input.pickupDate ||
      current.pickupTime !== input.pickupTime
    ) {
      return { ok: false, error: FRESH_PICKS_CART_PICKUP_MISMATCH };
    }
    if (
      !extraIsValidForCartPickup({
        pickupDate: current.pickupDate,
        pickupTime: current.pickupTime,
        pickupAvailableFromAt: input.pickupAvailableFromAt,
        orderCutoffAt: input.orderCutoffAt,
        now,
      })
    ) {
      return { ok: false, error: FRESH_PICKS_CART_UNAVAILABLE_FOR_PICKUP };
    }
  }

  const item: FreshPickCartItem = {
    extraStockId,
    cakeName: input.cakeName.trim() || "Fresh Pick",
    sizeLabel: input.sizeLabel.trim(),
    unitPrice: input.unitPrice,
    imageUrl: input.imageUrl,
    pickupDate: input.pickupDate,
    pickupTime: input.pickupTime,
  };
  const next: FreshPickCart = {
    ...current,
    pickupDate: current.items.length > 0 ? current.pickupDate : input.pickupDate,
    pickupTime: current.items.length > 0 ? current.pickupTime : input.pickupTime,
    items: [...current.items, item],
  };
  return { ok: true, cart: next, added: true };
}

export function removeFreshPickFromCart(
  cart: FreshPickCart,
  extraStockId: string,
): FreshPickCart {
  const items = cart.items.filter((item) => item.extraStockId !== extraStockId);
  if (items.length === 0) {
    return emptyFreshPickCart();
  }
  return { ...cart, items };
}

export function patchFreshPickCart(
  cart: FreshPickCart,
  patch: Partial<Omit<FreshPickCart, "items" | "pickupDate" | "pickupTime">>,
): FreshPickCart {
  return { ...cart, ...patch };
}

export function freshPickCheckoutHref(): string {
  return "/extra/checkout";
}
