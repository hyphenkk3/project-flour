import { customerPreorderCommercialTotal } from "@/engines/orders/customer-preorder-options";
import {
  OWNER_DELIVERY_CITY,
  OWNER_DELIVERY_STATE,
  parseCustomerWebsiteFulfilmentMethod,
  type CustomerWebsiteFulfilmentMethod,
} from "@/engines/orders/fulfilment";
import { calculateOrderTotal } from "@/engines/orders/totals";

export type PreorderDraftSizeChoice = {
  id: string;
  size: string;
  price: number;
  preorderDays: number;
  imageUrl?: string;
};

export type PreorderDraftItem = {
  cakeId: string;
  sizeId: string;
  quantity: number;
  cakeName: string;
  sizeLabel: string;
  unitPrice: number;
  /** Display/UX only. Final validation reloads live size preorder_days. */
  preorderDays?: number;
  /** Display-only thumbnail captured at add-to-order. */
  imageUrl?: string;
  /** Display/edit snapshot of offered sizes. Live catalogue still wins when loaded. */
  sizeChoices?: PreorderDraftSizeChoice[];
};

export type PhysicalReceiptChoice = "" | "yes" | "no";

export type PreorderDraftFields = {
  customerName: string;
  phone: string;
  email: string;
  emailSubmissionReceiptRequested: boolean;
  includeReceiptChoice: PhysicalReceiptChoice;
  pickupDate: string;
  pickupTime: string;
  /** Collection entry window — initial month for monthly catalogues. */
  pickupScopeFrom: string;
  pickupScopeTo: string;
  pickupScopeConstrainsBounds: boolean;
  /** Dine-in table-start time. Independent of cake serving (`pickupTime`). */
  reservationTime: string;
  fulfilmentMethod: CustomerWebsiteFulfilmentMethod;
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
  notes: string;
  complimentaryCodes: string[];
  paidAddonCodes: string[];
  birthdayCardMessage: string;
  wishingCardMessage: string;
  paidAddonUnitPriceByCode: Record<string, number>;
};

export type PreorderDraft = PreorderDraftFields & {
  items: PreorderDraftItem[];
};

export const PREORDER_DRAFT_KEY = "whitebird-preorder-draft-v1";

/** Same-tab signal so the cart shell refreshes after Add / edit. */
export const PREORDER_DRAFT_CHANGED_EVENT = "whitebird-preorder-draft-changed";

function emitPreorderDraftChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PREORDER_DRAFT_CHANGED_EVENT));
}

export function parsePhysicalReceiptChoice(
  value: unknown,
): PhysicalReceiptChoice {
  return value === "yes" || value === "no" ? value : "";
}

/** Explicit Yes/No only. Unset is not treated as No. */
export function parseRequiredPhysicalReceipt(value: unknown): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

export const emptyPreorderFields = (): PreorderDraftFields => ({
  customerName: "",
  phone: "",
  email: "",
  emailSubmissionReceiptRequested: false,
  includeReceiptChoice: "",
  pickupDate: "",
  pickupScopeFrom: "",
  pickupScopeTo: "",
  pickupScopeConstrainsBounds: false,
  pickupTime: "",
  reservationTime: "",
  fulfilmentMethod: "pickup",
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
  notes: "",
  complimentaryCodes: [],
  paidAddonCodes: [],
  birthdayCardMessage: "",
  wishingCardMessage: "",
  paidAddonUnitPriceByCode: {},
});

export function emptyPreorderDraft(): PreorderDraft {
  return {
    ...emptyPreorderFields(),
    items: [],
  };
}

export function readPreorderDraft(): PreorderDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PREORDER_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PreorderDraft>;
    if (!parsed?.items || !Array.isArray(parsed.items)) return null;
    return {
      ...emptyPreorderFields(),
      ...parsed,
      customerName: String(parsed.customerName ?? ""),
      phone: String(parsed.phone ?? ""),
      email: String(parsed.email ?? ""),
      emailSubmissionReceiptRequested: Boolean(
        parsed.emailSubmissionReceiptRequested,
      ),
      includeReceiptChoice: parsePhysicalReceiptChoice(
        parsed.includeReceiptChoice,
      ),
      pickupDate: String(parsed.pickupDate ?? ""),
      pickupScopeFrom: String(parsed.pickupScopeFrom ?? ""),
      pickupScopeTo: String(parsed.pickupScopeTo ?? ""),
      pickupScopeConstrainsBounds: parsed.pickupScopeConstrainsBounds === true,
      pickupTime: String(parsed.pickupTime ?? ""),
      reservationTime: String(parsed.reservationTime ?? ""),
      fulfilmentMethod: parseCustomerWebsiteFulfilmentMethod(
        parsed.fulfilmentMethod,
      ),
      dineInVenue: String(parsed.dineInVenue ?? ""),
      guestCount: String(parsed.guestCount ?? ""),
      reservationNote: String(parsed.reservationNote ?? ""),
      recipientName: String(parsed.recipientName ?? ""),
      recipientPhone: String(parsed.recipientPhone ?? ""),
      addressLine1: String(parsed.addressLine1 ?? ""),
      addressLine2: String(parsed.addressLine2 ?? ""),
      postcode: String(parsed.postcode ?? ""),
      city: String(parsed.city ?? OWNER_DELIVERY_CITY),
      state: String(parsed.state ?? OWNER_DELIVERY_STATE),
      recipientNotifyPreference: String(
        parsed.recipientNotifyPreference ?? "",
      ),
      sameAsCustomer: parsed.sameAsCustomer !== false,
      notes: String(parsed.notes ?? ""),
      complimentaryCodes: Array.isArray(parsed.complimentaryCodes)
        ? parsed.complimentaryCodes.map((code) => String(code))
        : [],
      paidAddonCodes: Array.isArray(parsed.paidAddonCodes)
        ? parsed.paidAddonCodes.map((code) => String(code))
        : [],
      birthdayCardMessage: String(parsed.birthdayCardMessage ?? ""),
      wishingCardMessage: String(parsed.wishingCardMessage ?? ""),
      paidAddonUnitPriceByCode:
        parsed.paidAddonUnitPriceByCode &&
        typeof parsed.paidAddonUnitPriceByCode === "object"
          ? Object.fromEntries(
              Object.entries(parsed.paidAddonUnitPriceByCode).map(
                ([code, price]) => [code, Number(price) || 0],
              ),
            )
          : {},
      items: parsed.items.map((item) => ({
        cakeId: String(item.cakeId ?? ""),
        sizeId: String(item.sizeId ?? ""),
        quantity: Number(item.quantity) || 1,
        cakeName: String(item.cakeName ?? ""),
        sizeLabel: String(item.sizeLabel ?? ""),
        unitPrice: Number(item.unitPrice) || 0,
        preorderDays:
          typeof item.preorderDays === "number" && item.preorderDays >= 1
            ? item.preorderDays
            : Number(item.preorderDays) >= 1
              ? Number(item.preorderDays)
              : undefined,
        imageUrl:
          typeof item.imageUrl === "string" && item.imageUrl.trim()
            ? item.imageUrl.trim()
            : undefined,
        sizeChoices: parseDraftSizeChoices(item.sizeChoices),
      })),
    };
  } catch {
    return null;
  }
}

export function writePreorderDraft(draft: PreorderDraft): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PREORDER_DRAFT_KEY, JSON.stringify(draft));
  emitPreorderDraftChanged();
}

export function clearPreorderDraft(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PREORDER_DRAFT_KEY);
  emitPreorderDraftChanged();
}

export function mergeDraftItem(
  draft: PreorderDraft,
  item: PreorderDraftItem,
): PreorderDraft {
  const existingIndex = draft.items.findIndex(
    (entry) => entry.cakeId === item.cakeId && entry.sizeId === item.sizeId,
  );
  if (existingIndex === -1) {
    return { ...draft, items: [...draft.items, item] };
  }
  const next = [...draft.items];
  const existing = next[existingIndex];
  next[existingIndex] = {
    ...existing,
    quantity: existing.quantity + item.quantity,
    imageUrl: existing.imageUrl ?? item.imageUrl,
    sizeChoices: item.sizeChoices ?? existing.sizeChoices,
  };
  return { ...draft, items: next };
}

function parseDraftSizeChoices(
  value: unknown,
): PreorderDraftSizeChoice[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const choices: PreorderDraftSizeChoice[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Partial<PreorderDraftSizeChoice>;
    const id = String(row.id ?? "").trim();
    const size = String(row.size ?? "").trim();
    const price = Number(row.price);
    const preorderDays = Number(row.preorderDays);
    if (!id || !size || !Number.isFinite(price) || preorderDays < 1) continue;
    const imageUrl =
      typeof row.imageUrl === "string" && row.imageUrl.trim()
        ? row.imageUrl.trim()
        : undefined;
    choices.push({
      id,
      size,
      price,
      preorderDays,
      imageUrl,
    });
  }
  return choices.length > 0 ? choices : undefined;
}

/** Size/price/preorder/image only. Does not change collection date. */
export function setDraftLineSize(
  cakeId: string,
  currentSizeId: string,
  nextSize: PreorderDraftSizeChoice,
): PreorderDraft {
  const current = readPreorderDraft() ?? emptyPreorderDraft();
  if (!nextSize.id || nextSize.id === currentSizeId) return current;
  const source = current.items.find(
    (item) => item.cakeId === cakeId && item.sizeId === currentSizeId,
  );
  if (!source) return current;
  const updated: PreorderDraftItem = {
    ...source,
    sizeId: nextSize.id,
    sizeLabel: nextSize.size,
    unitPrice: nextSize.price,
    preorderDays: nextSize.preorderDays,
    imageUrl: nextSize.imageUrl ?? source.imageUrl,
  };
  const withoutSource = current.items.filter(
    (item) => !(item.cakeId === cakeId && item.sizeId === currentSizeId),
  );
  const mergeIndex = withoutSource.findIndex(
    (item) => item.cakeId === cakeId && item.sizeId === nextSize.id,
  );
  const items =
    mergeIndex === -1
      ? current.items.map((item) =>
          item.cakeId === cakeId && item.sizeId === currentSizeId
            ? updated
            : item,
        )
      : withoutSource.map((item, index) =>
          index === mergeIndex
            ? {
                ...item,
                quantity: item.quantity + source.quantity,
                imageUrl: item.imageUrl ?? updated.imageUrl,
                sizeChoices: item.sizeChoices ?? updated.sizeChoices,
              }
            : item,
        );
  const next = { ...current, items };
  writePreorderDraft(next);
  return next;
}

/** Quantity only. Does not change collection date. */
export function setDraftLineQuantity(
  cakeId: string,
  sizeId: string,
  quantity: number,
): PreorderDraft {
  const current = readPreorderDraft() ?? emptyPreorderDraft();
  const qty = Math.max(1, Math.trunc(quantity) || 1);
  const next = {
    ...current,
    items: current.items.map((item) =>
      item.cakeId === cakeId && item.sizeId === sizeId
        ? { ...item, quantity: qty }
        : item,
    ),
  };
  writePreorderDraft(next);
  return next;
}

/** Remove one cake+size line. Does not change collection date. */
export function removeDraftLine(
  cakeId: string,
  sizeId: string,
): PreorderDraft {
  const current = readPreorderDraft() ?? emptyPreorderDraft();
  const next = {
    ...current,
    items: current.items.filter(
      (item) => !(item.cakeId === cakeId && item.sizeId === sizeId),
    ),
  };
  writePreorderDraft(next);
  return next;
}

export function draftHasItems(draft: PreorderDraft | null): boolean {
  return Boolean(draft?.items?.length);
}

/** Resume checkout preserving collection entry scope when available. */
export function preorderCheckoutHref(draft: PreorderDraft | null): string {
  if (!draft?.pickupScopeFrom || !draft.pickupScopeTo) {
    return "/order/checkout";
  }
  const params = new URLSearchParams();
  params.set("from", draft.pickupScopeFrom);
  params.set("to", draft.pickupScopeTo);
  if (/^\d{4}-\d{2}-\d{2}$/.test(draft.pickupDate)) {
    params.set("pickup", draft.pickupDate);
  }
  return `/order/checkout?${params.toString()}`;
}

export function draftCakeCount(draft: PreorderDraft | null): number {
  if (!draft?.items?.length) return 0;
  return draft.items.reduce((sum, item) => sum + item.quantity, 0);
}

export function draftTotal(draft: PreorderDraft | null): number {
  if (!draft?.items?.length) return 0;
  const catalog = Object.entries(draft.paidAddonUnitPriceByCode ?? {}).map(
    ([code, unitPrice], index) => ({
      code,
      name: code,
      unitPrice: Number(unitPrice),
      financialShorthand: "",
      sortOrder: index,
    }),
  );
  if (catalog.length === 0) {
    return calculateOrderTotal(draft.items);
  }
  return customerPreorderCommercialTotal({
    items: draft.items,
    options: catalog,
    selectedCodes: draft.paidAddonCodes ?? [],
  });
}

/**
 * Drop draft lines that are not offered on the current storefront catalogue.
 * Refreshes display name/size/price from live catalog (display-only; RPC snapshots price).
 */
export function filterDraftItemsToOfferedCakes(
  items: PreorderDraftItem[],
  cakes: Array<{
    id: string;
    name: string;
    sizes: Array<{
      id: string;
      size: string;
      price: number;
      preorderDays?: number;
    }>;
  }>,
): { items: PreorderDraftItem[]; dropped: boolean } {
  const cakesById = new Map(cakes.map((cake) => [cake.id, cake]));
  const next: PreorderDraftItem[] = [];
  let dropped = false;
  for (const item of items) {
    const cake = cakesById.get(item.cakeId);
    const size = cake?.sizes.find((entry) => entry.id === item.sizeId);
    if (!cake || !size) {
      dropped = true;
      continue;
    }
    next.push({
      ...item,
      cakeName: cake.name,
      sizeLabel: size.size,
      unitPrice: size.price,
      quantity: Math.max(1, Number(item.quantity) || 1),
      preorderDays: size.preorderDays ?? item.preorderDays,
    });
  }
  return { items: consolidateDraftLines(next), dropped };
}

function consolidateDraftLines(items: PreorderDraftItem[]): PreorderDraftItem[] {
  const map = new Map<string, PreorderDraftItem>();
  for (const item of items) {
    const key = `${item.cakeId}::${item.sizeId}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}

/** Patch fields onto the current draft without dropping items. */
export function patchPreorderDraft(
  patch: Partial<PreorderDraft>,
): PreorderDraft {
  const current = readPreorderDraft() ?? emptyPreorderDraft();
  const next = { ...current, ...patch, items: patch.items ?? current.items };
  writePreorderDraft(next);
  return next;
}

/** Clear method-specific fields when the customer switches fulfilment. */
export function fieldsAfterFulfilmentChange(
  fields: PreorderDraftFields,
  method: CustomerWebsiteFulfilmentMethod,
): PreorderDraftFields {
  return {
    ...fields,
    fulfilmentMethod: method,
    pickupTime: "",
    reservationTime: "",
    dineInVenue: "",
    guestCount: method === "dine_in" ? fields.guestCount : "",
    reservationNote: method === "dine_in" ? fields.reservationNote : "",
    recipientName: method === "delivery" ? fields.recipientName : "",
    recipientPhone: method === "delivery" ? fields.recipientPhone : "",
    addressLine1: method === "delivery" ? fields.addressLine1 : "",
    addressLine2: method === "delivery" ? fields.addressLine2 : "",
    postcode: method === "delivery" ? fields.postcode : "",
    city: method === "delivery" ? fields.city : OWNER_DELIVERY_CITY,
    state: method === "delivery" ? fields.state : OWNER_DELIVERY_STATE,
    recipientNotifyPreference:
      method === "delivery" ? fields.recipientNotifyPreference : "",
    sameAsCustomer: method === "delivery" ? fields.sameAsCustomer : true,
  };
}
