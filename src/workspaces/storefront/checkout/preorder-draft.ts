import { customerPreorderCommercialTotal } from "@/engines/orders/customer-preorder-options";
import { calculateOrderTotal } from "@/engines/orders/totals";

export type PreorderDraftItem = {
  cakeId: string;
  sizeId: string;
  quantity: number;
  cakeName: string;
  sizeLabel: string;
  unitPrice: number;
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
  pickupTime: "",
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
      items: parsed.items,
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
      pickupTime: String(parsed.pickupTime ?? ""),
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
    };
  } catch {
    return null;
  }
}

export function writePreorderDraft(draft: PreorderDraft): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PREORDER_DRAFT_KEY, JSON.stringify(draft));
}

export function clearPreorderDraft(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PREORDER_DRAFT_KEY);
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
  };
  return { ...draft, items: next };
}

export function draftHasItems(draft: PreorderDraft | null): boolean {
  return Boolean(draft?.items?.length);
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
    sizes: Array<{ id: string; size: string; price: number }>;
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
