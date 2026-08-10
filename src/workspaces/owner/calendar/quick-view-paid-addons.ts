/**
 * Calendar Quick View paid-add-on presentation (M4-P1 Slice 5).
 * Snapshot order truth only — never live catalog name/price.
 * Message labels match Crew operational clarity (Message: / Card N:).
 */

import { formatCrewPaidAddonMessageLines } from "@/engines/orders/messages";
import { normalizePaidAddonLines } from "@/engines/orders/totals";
import type { StorefrontPaidAddon } from "@/types/storefront";

export type QuickViewPaidAddonBlock = {
  code: string;
  /** e.g. Birthday Card ×2 — snapshotted name + commercial quantity. */
  title: string;
  /** Non-empty per-card messages only; blank slots omitted. */
  messageLines: string[];
};

function sortPaidAddonsForQuickView(
  paidAddons: StorefrontPaidAddon[],
): StorefrontPaidAddon[] {
  return [...paidAddons].sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      String(a.code ?? "").localeCompare(String(b.code ?? ""), "en"),
  );
}

/** Commercial title using Quick View × convention (same as cakes / complimentary). */
export function formatQuickViewPaidAddonTitle(input: {
  name: string;
  quantity: number;
}): string {
  const name = input.name.trim() || "Add-on";
  const qty = Math.max(1, Math.floor(Number(input.quantity) || 1));
  return `${name} ×${qty}`;
}

/**
 * Build ADD-ONS blocks for Quick View, or [] when none (omit section).
 * Historical / missing paidAddons → [].
 */
export function buildQuickViewPaidAddonBlocks(
  paidAddons: StorefrontPaidAddon[] | null | undefined,
): QuickViewPaidAddonBlock[] {
  const addons = sortPaidAddonsForQuickView(
    normalizePaidAddonLines(paidAddons),
  );
  return addons.map((addon) => ({
    code: addon.code,
    title: formatQuickViewPaidAddonTitle({
      name: addon.name,
      quantity: addon.quantity,
    }),
    messageLines: formatCrewPaidAddonMessageLines({
      quantity: addon.quantity,
      writtenMessage: addon.writtenMessage,
      messages: addon.messages,
    }),
  }));
}
