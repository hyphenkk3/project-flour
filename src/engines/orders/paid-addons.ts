/**
 * Owner paid-add-on draft / payload helpers (M4-P1 Slice 3).
 * Server remains authoritative for price/name/shorthand snapshots.
 * Per-physical-card messages live under the commercial line (not money).
 */

import type { PaidAddonType, StorefrontPaidAddon } from "@/types/storefront";

/** Fallback when catalog max_quantity is missing (P1 cards = 3). */
export const DEFAULT_PAID_ADDON_MAX_QUANTITY = 3;

export type EditablePaidAddonDraft = {
  code: string;
  /** Display name: snapshot when retained, else catalog. */
  name: string;
  /** Live catalog unit price for new selection display. */
  catalogUnitPrice: number;
  /** Existing line snapshot unit price when retained; null if not yet on order. */
  snapshotUnitPrice: number | null;
  selected: boolean;
  quantity: number;
  maxQuantity: number;
  /** Length always matches quantity when selected; empty string = blank slot. */
  writtenMessages: string[];
  sortOrder: number;
};

/** Client → RPC mutation payload (identity + qty + per-card messages only). */
export type PaidAddonMutationPayload = {
  code: string;
  quantity: number;
  /** Index 0 = Card 1. Length may be ≤ quantity; extras ignored server-side. */
  messages: Array<string | null>;
};

export function normalizeWrittenMessage(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Clamp quantity into 1..maxQuantity. */
export function clampPaidAddonQuantity(
  quantity: number,
  maxQuantity: number = DEFAULT_PAID_ADDON_MAX_QUANTITY,
): number {
  const max = Math.max(1, Math.floor(maxQuantity) || DEFAULT_PAID_ADDON_MAX_QUANTITY);
  const qty = Math.floor(Number(quantity) || 1);
  if (qty < 1) return 1;
  if (qty > max) return max;
  return qty;
}

/**
 * Resize per-card message slots when quantity changes.
 * Grow → pad blank. Shrink → drop higher indices (no resurrection).
 */
export function resizeWrittenMessages(
  messages: string[] | null | undefined,
  quantity: number,
): string[] {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const current = Array.isArray(messages) ? messages.map((m) => String(m ?? "")) : [];
  if (current.length === qty) return current;
  if (current.length > qty) return current.slice(0, qty);
  return [...current, ...Array.from({ length: qty - current.length }, () => "")];
}

/** Normalize persisted/child messages into a quantity-length display array. */
export function messagesForQuantity(
  messages:
    | Array<{ cardIndex: number; writtenMessage: string | null }>
    | string[]
    | null
    | undefined,
  quantity: number,
  /** Legacy single-message fallback (pre–per-card). */
  legacyWrittenMessage?: string | null,
): string[] {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const slots = Array.from({ length: qty }, () => "");

  if (Array.isArray(messages) && messages.length > 0) {
    if (typeof messages[0] === "string" || messages[0] == null) {
      const arr = messages as Array<string | null>;
      for (let i = 0; i < qty; i += 1) {
        slots[i] = arr[i] != null ? String(arr[i]) : "";
      }
      return slots;
    }
    for (const row of messages as Array<{
      cardIndex: number;
      writtenMessage: string | null;
    }>) {
      const idx = Number(row.cardIndex);
      if (!Number.isInteger(idx) || idx < 1 || idx > qty) continue;
      slots[idx - 1] = row.writtenMessage ?? "";
    }
    return slots;
  }

  if (legacyWrittenMessage != null && legacyWrittenMessage !== "") {
    slots[0] = legacyWrittenMessage;
  }
  return slots;
}

/** Build create/edit rows from active catalog + existing order lines. */
export function buildEditablePaidAddonDrafts(input: {
  catalog: PaidAddonType[];
  existing?: StorefrontPaidAddon[] | null;
}): EditablePaidAddonDraft[] {
  const existing = [...(input.existing ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, "en"),
  );
  const existingByCode = new Map(existing.map((row) => [row.code, row]));
  const rows: EditablePaidAddonDraft[] = [];
  const seen = new Set<string>();

  const activeCatalog = [...input.catalog]
    .filter((row) => row.isActive)
    .sort(
      (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, "en"),
    );

  for (const type of activeCatalog) {
    const line = existingByCode.get(type.code);
    const maxQuantity =
      type.maxQuantity ?? DEFAULT_PAID_ADDON_MAX_QUANTITY;
    const quantity = line
      ? clampPaidAddonQuantity(line.quantity, maxQuantity)
      : 1;
    rows.push({
      code: type.code,
      name: line?.name ?? type.name,
      catalogUnitPrice: type.unitPrice,
      snapshotUnitPrice: line ? line.unitPrice : null,
      selected: Boolean(line),
      quantity,
      maxQuantity,
      writtenMessages: line
        ? messagesForQuantity(
            line.messages,
            quantity,
            line.writtenMessage,
          )
        : resizeWrittenMessages([], 1),
      sortOrder: line?.sortOrder ?? type.sortOrder,
    });
    seen.add(type.code);
  }

  // Historical lines whose type is inactive / missing from catalog.
  for (const line of existing) {
    if (seen.has(line.code)) continue;
    const maxQuantity = DEFAULT_PAID_ADDON_MAX_QUANTITY;
    const quantity = clampPaidAddonQuantity(line.quantity, maxQuantity);
    rows.push({
      code: line.code,
      name: line.name,
      catalogUnitPrice: line.unitPrice,
      snapshotUnitPrice: line.unitPrice,
      selected: true,
      quantity,
      maxQuantity,
      writtenMessages: messagesForQuantity(
        line.messages,
        quantity,
        line.writtenMessage,
      ),
      sortOrder: line.sortOrder,
    });
  }

  return rows.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, "en"),
  );
}

/** Selected drafts → server mutation payload (no price/name/shorthand). */
export function paidAddonDraftsToMutationPayload(
  drafts: EditablePaidAddonDraft[],
): PaidAddonMutationPayload[] {
  return drafts
    .filter((row) => row.selected && row.quantity > 0)
    .map((row) => {
      const quantity = clampPaidAddonQuantity(row.quantity, row.maxQuantity);
      const slots = resizeWrittenMessages(row.writtenMessages, quantity);
      return {
        code: row.code,
        quantity,
        messages: slots.map((m) => normalizeWrittenMessage(m)),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, "en"));
}

export function serializePaidAddonsForConfirmation(
  items: Array<{
    code: string;
    quantity: number;
    unitPrice?: number;
    name?: string;
    financialShorthand?: string;
    writtenMessage?: string | null;
    messages?: Array<{ cardIndex: number; writtenMessage: string | null }> | Array<string | null>;
  }>,
): string {
  return [...items]
    .map((item) => {
      const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
      const slots = messagesForQuantity(
        item.messages as
          | Array<{ cardIndex: number; writtenMessage: string | null }>
          | string[]
          | null
          | undefined,
        qty,
        item.writtenMessage,
      ).map((m) => normalizeWrittenMessage(m) ?? "");
      return [
        item.code,
        qty,
        Number(item.unitPrice ?? 0).toFixed(2),
        item.name ?? "",
        item.financialShorthand ?? "",
        slots.join("~"),
      ].join("|");
    })
    .sort()
    .join(";");
}

export function paidAddonsMateriallyDiffer(
  before: Array<{
    code: string;
    quantity: number;
    unitPrice?: number;
    name?: string;
    financialShorthand?: string;
    writtenMessage?: string | null;
    messages?: Array<{ cardIndex: number; writtenMessage: string | null }> | Array<string | null>;
  }>,
  after: Array<{
    code: string;
    quantity: number;
    unitPrice?: number;
    name?: string;
    financialShorthand?: string;
    writtenMessage?: string | null;
    messages?: Array<{ cardIndex: number; writtenMessage: string | null }> | Array<string | null>;
  }>,
): boolean {
  return (
    serializePaidAddonsForConfirmation(before) !==
    serializePaidAddonsForConfirmation(after)
  );
}

/** Concise timeline metadata rows (per-card messages). */
export function paidAddonsTimelineSummary(
  items: Array<{
    code: string;
    quantity: number;
    writtenMessage?: string | null;
    messages?: Array<{ cardIndex: number; writtenMessage: string | null }> | Array<string | null>;
  }>,
): Array<{
  code: string;
  quantity: number;
  messages: Array<{ cardIndex: number; message: string | null }>;
}> {
  return [...items]
    .map((item) => {
      const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
      const slots = messagesForQuantity(
        item.messages as
          | Array<{ cardIndex: number; writtenMessage: string | null }>
          | string[]
          | null
          | undefined,
        quantity,
        item.writtenMessage,
      );
      return {
        code: item.code,
        quantity,
        messages: slots.map((message, index) => ({
          cardIndex: index + 1,
          message: normalizeWrittenMessage(message),
        })),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, "en"));
}
