import { calculateOrderTotal } from "@/engines/orders/totals";

export type PreorderDraftItem = {
  cakeId: string;
  sizeId: string;
  quantity: number;
  cakeName: string;
  sizeLabel: string;
  unitPrice: number;
};

export type PreorderDraftFields = {
  customerName: string;
  phone: string;
  email: string;
  emailSubmissionReceiptRequested: boolean;
  pickupDate: string;
  pickupTime: string;
  notes: string;
};

export type PreorderDraft = PreorderDraftFields & {
  items: PreorderDraftItem[];
};

export const PREORDER_DRAFT_KEY = "whitebird-preorder-draft-v1";

export const emptyPreorderFields = (): PreorderDraftFields => ({
  customerName: "",
  phone: "",
  email: "",
  emailSubmissionReceiptRequested: false,
  pickupDate: "",
  pickupTime: "",
  notes: "",
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
      pickupDate: String(parsed.pickupDate ?? ""),
      pickupTime: String(parsed.pickupTime ?? ""),
      notes: String(parsed.notes ?? ""),
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
  return calculateOrderTotal(draft.items);
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
