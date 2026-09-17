import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  FRESH_PICKS_ALREADY_IN_CART,
  FRESH_PICKS_CART_PICKUP_MISMATCH,
  FRESH_PICKS_CART_UNAVAILABLE_FOR_PICKUP,
} from "@/engines/extra/customer-fresh-picks";
import { isValidExtraCustomerFulfilment } from "@/engines/extra/fresh-picks-fulfilment";
import type { FreshPicksPreparationConfig } from "@/engines/extra/fresh-picks-preparation";
import {
  OWNER_DELIVERY_CITY,
  OWNER_DELIVERY_STATE,
  parseCustomerWebsiteFulfilmentMethod,
  type CustomerWebsiteFulfilmentMethod,
} from "@/engines/orders/fulfilment";
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
  fulfilmentMethod: CustomerWebsiteFulfilmentMethod;
  pickupAvailableFromAt: string;
  orderCutoffAt: string;
  dineInVenue: string;
  guestCount: string;
  reservationNote: string;
  recipientName: string;
  recipientPhone: string;
  addressLine1: string;
  addressLine2: string;
  postcode: string;
  city: string;
  state: string;
  recipientNotifyPreference: string;
  sameAsCustomer: boolean;
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
  fulfilmentMethod?: CustomerWebsiteFulfilmentMethod;
  pickupAvailableFromAt: string;
  orderCutoffAt: string;
};

export type FreshPickCartValidationContext = {
  now?: Date;
  snapshot?: OperatingHoursSnapshot;
  config?: FreshPicksPreparationConfig;
};

export type FreshPickCartAddResult =
  | { ok: true; cart: FreshPickCart; added: boolean }
  | { ok: false; error: string };

export function emptyFreshPickCart(): FreshPickCart {
  return {
    pickupDate: "",
    pickupTime: "",
    fulfilmentMethod: "pickup",
    pickupAvailableFromAt: "",
    orderCutoffAt: "",
    dineInVenue: "",
    guestCount: "",
    reservationNote: "",
    recipientName: "",
    recipientPhone: "",
    addressLine1: "",
    addressLine2: "",
    postcode: "",
    city: OWNER_DELIVERY_CITY,
    state: OWNER_DELIVERY_STATE,
    recipientNotifyPreference: "",
    sameAsCustomer: true,
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
  const empty = emptyFreshPickCart();
  return {
    ...empty,
    pickupDate: isYmd(pickupDate) ? pickupDate : items[0]?.pickupDate ?? "",
    pickupTime: isHm(pickupTime) ? pickupTime : items[0]?.pickupTime ?? "",
    fulfilmentMethod: parseCustomerWebsiteFulfilmentMethod(
      String(row.fulfilmentMethod ?? "pickup"),
    ),
    pickupAvailableFromAt: String(row.pickupAvailableFromAt ?? ""),
    orderCutoffAt: String(row.orderCutoffAt ?? ""),
    dineInVenue: String(row.dineInVenue ?? ""),
    guestCount: String(row.guestCount ?? ""),
    reservationNote: String(row.reservationNote ?? ""),
    recipientName: String(row.recipientName ?? ""),
    recipientPhone: String(row.recipientPhone ?? ""),
    addressLine1: String(row.addressLine1 ?? ""),
    addressLine2: String(row.addressLine2 ?? ""),
    postcode: String(row.postcode ?? ""),
    city: String(row.city ?? OWNER_DELIVERY_CITY) || OWNER_DELIVERY_CITY,
    state: String(row.state ?? OWNER_DELIVERY_STATE) || OWNER_DELIVERY_STATE,
    recipientNotifyPreference: String(row.recipientNotifyPreference ?? ""),
    sameAsCustomer: row.sameAsCustomer !== false,
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
 * Grouped catalogue CTA: Added to Cart once any exact unit is in the cart.
 * Add another is offered only while a remaining exact extra_stock.id exists.
 */
export function freshPickCatalogueCtaState(
  extraStockIds: readonly string[],
  cart: FreshPickCart | null | undefined,
): {
  extraStockId: string | null;
  addedToCart: boolean;
  addAnotherStockId: string | null;
} {
  const ids = extraStockIds.map((id) => id.trim()).filter(Boolean);
  const remaining = ids.filter((id) => !freshPickCartHasExtra(cart, id));
  const selected = ids.filter((id) => freshPickCartHasExtra(cart, id));
  if (selected.length === 0) {
    return {
      extraStockId: remaining[0] ?? ids[0] ?? null,
      addedToCart: false,
      addAnotherStockId: null,
    };
  }
  return {
    extraStockId: selected[0] ?? null,
    addedToCart: true,
    addAnotherStockId: remaining[0] ?? null,
  };
}

export function freshPickCartCount(cart: FreshPickCart | null): number {
  return cart?.items.length ?? 0;
}

export function freshPickCartTotal(cart: FreshPickCart | null): number {
  if (!cart) return 0;
  return cart.items.reduce((sum, item) => sum + (item.unitPrice ?? 0), 0);
}

export function extraIsValidForCartPickup(
  input: {
    pickupDate: string;
    pickupTime: string;
    pickupAvailableFromAt: string;
    orderCutoffAt: string;
    fulfilmentMethod?: CustomerWebsiteFulfilmentMethod;
    now?: Date;
  },
  context: FreshPickCartValidationContext = {},
): boolean {
  return isValidExtraCustomerFulfilment({
    method: parseCustomerWebsiteFulfilmentMethod(input.fulfilmentMethod),
    fulfilmentDate: input.pickupDate,
    fulfilmentTime: input.pickupTime,
    pickupAvailableFromAt: input.pickupAvailableFromAt,
    orderCutoffAt: input.orderCutoffAt,
    now: input.now ?? context.now,
    snapshot: context.snapshot,
    config: context.config,
  });
}

export function addFreshPickToCart(
  cart: FreshPickCart | null,
  input: FreshPickCartAddInput,
  now?: Date,
  context: FreshPickCartValidationContext = {},
): FreshPickCartAddResult {
  const extraStockId = input.extraStockId.trim();
  const fulfilmentMethod = parseCustomerWebsiteFulfilmentMethod(
    input.fulfilmentMethod,
  );
  if (!extraStockId) {
    return { ok: false, error: "Extra is required" };
  }
  if (
    !extraIsValidForCartPickup(
      {
        pickupDate: input.pickupDate,
        pickupTime: input.pickupTime,
        pickupAvailableFromAt: input.pickupAvailableFromAt,
        orderCutoffAt: input.orderCutoffAt,
        fulfilmentMethod,
        now,
      },
      context,
    )
  ) {
    return { ok: false, error: "Please choose a valid fulfilment time for that date." };
  }

  const current = cart ?? emptyFreshPickCart();
  if (current.items.some((item) => item.extraStockId === extraStockId)) {
    return { ok: false, error: FRESH_PICKS_ALREADY_IN_CART };
  }

  if (current.items.length > 0) {
    if (
      current.pickupDate !== input.pickupDate ||
      current.pickupTime !== input.pickupTime ||
      current.fulfilmentMethod !== fulfilmentMethod
    ) {
      return { ok: false, error: FRESH_PICKS_CART_PICKUP_MISMATCH };
    }
    if (
      !extraIsValidForCartPickup(
        {
          pickupDate: current.pickupDate,
          pickupTime: current.pickupTime,
          pickupAvailableFromAt: input.pickupAvailableFromAt,
          orderCutoffAt: input.orderCutoffAt,
          fulfilmentMethod: current.fulfilmentMethod,
          now,
        },
        context,
      )
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
    fulfilmentMethod:
      current.items.length > 0 ? current.fulfilmentMethod : fulfilmentMethod,
    pickupAvailableFromAt:
      current.items.length > 0
        ? current.pickupAvailableFromAt
        : input.pickupAvailableFromAt,
    orderCutoffAt:
      current.items.length > 0 ? current.orderCutoffAt : input.orderCutoffAt,
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
  patch: Partial<Omit<FreshPickCart, "items">>,
): FreshPickCart {
  return { ...cart, ...patch };
}

export function freshPickCheckoutHref(): string {
  return "/extra/checkout";
}
