/**
 * Shared order financial equation from commercial line snapshots + effective adjustments.
 * Used by Crew Order Message (amount head) and Customer Confirmation (financial block).
 * Does not include payment / NYP / c/o notation.
 */

import {
  AUGUST_PROMO_CODE,
  crewRm10VoucherShorthand,
  RM10_CARD_CODE,
} from "@/engines/orders/promotions";
import { formatOrderTotal } from "@/engines/orders/totals";
import type { OrderAdjustment } from "@/types/storefront";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";

export type FinancialEquationItem = {
  unitPrice: number;
  quantity: number;
  /** Present for paid add-ons (BC / WC). Omit for cake lines. */
  financialShorthand?: string | null;
};

export type FinancialEquationAdjustment = Pick<
  OrderAdjustment,
  "amount" | "label" | "code" | "metadata"
>;

/**
 * One commercial component:
 * - Cake qty 1: RM125
 * - Cake qty 2: RM125*2
 * - Add-on qty 1: RM3(BC)
 * - Add-on qty 2: RM3*2(BC)
 */
export function formatItemPriceComponent(input: {
  unitPrice: number;
  quantity: number;
  financialShorthand?: string | null;
}): string {
  const qty = Math.max(1, Number(input.quantity) || 1);
  const price = formatRm(Number(input.unitPrice));
  const shorthand = input.financialShorthand?.trim() ?? "";
  const base = qty === 1 ? price : `${price}*${qty}`;
  if (!shorthand) return base;
  return `${base}(${shorthand})`;
}

/** Cake lines first, then paid add-ons (caller supplies already-sorted add-ons). */
export function commercialEquationItems(input: {
  cakes: Array<{ unitPrice: number; quantity: number }>;
  paidAddons?: Array<{
    unitPrice: number;
    quantity: number;
    financialShorthand: string;
  }> | null;
}): FinancialEquationItem[] {
  const cakes = input.cakes.map((item) => ({
    unitPrice: Number(item.unitPrice),
    quantity: Number(item.quantity),
  }));
  const addons = (input.paidAddons ?? []).map((item) => ({
    unitPrice: Number(item.unitPrice),
    quantity: Number(item.quantity),
    financialShorthand: item.financialShorthand,
  }));
  return [...cakes, ...addons];
}

/**
 * Authoritative equation reconciling to amountDue.
 * Single ×1 cake with no shorthand and no adjustments → concise RMamountDue only.
 */
export function formatOrderFinancialEquation(input: {
  items: FinancialEquationItem[];
  effective: FinancialEquationAdjustment[];
  amountDue: number;
}): string {
  const items = input.items;
  const effective = input.effective;
  const amountDueLabel = formatOrderTotal(input.amountDue);

  if (items.length === 0) {
    if (effective.length === 0) return amountDueLabel;
    return appendAdjustmentsEquation("", effective, input.amountDue);
  }

  const itemParts = items.map((item) =>
    formatItemPriceComponent({
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      financialShorthand: item.financialShorthand,
    }),
  );
  const itemExpression = itemParts.join("+");
  const hasQtyMultiplier = items.some(
    (item) => Math.max(1, Number(item.quantity) || 1) > 1,
  );
  const hasShorthand = items.some(
    (item) => (item.financialShorthand?.trim() ?? "").length > 0,
  );
  const needsEquation =
    items.length > 1 ||
    hasQtyMultiplier ||
    hasShorthand ||
    effective.length > 0;

  if (!needsEquation) {
    return amountDueLabel;
  }

  return appendAdjustmentsEquation(itemExpression, effective, input.amountDue);
}

function appendAdjustmentsEquation(
  itemExpression: string,
  effective: FinancialEquationAdjustment[],
  amountDue: number,
): string {
  let equation = itemExpression;
  for (const adj of effective) {
    const abs = Math.abs(adj.amount);
    const label = equationAdjustmentShorthand(adj);
    if (adj.amount < 0) {
      equation += `-${formatRm(abs)}(${label})`;
    } else {
      equation += `+${formatRm(abs)}(${label})`;
    }
  }
  equation += `= ${formatRm(amountDue)}`;
  return equation;
}

export function equationAdjustmentShorthand(
  adj: Pick<OrderAdjustment, "label" | "code" | "metadata">,
): string {
  const label = adj.label.trim();
  const code = adj.code?.trim() ?? "";
  if (code === AUGUST_PROMO_CODE) return "AugPromo";
  if (code === RM10_CARD_CODE) {
    return crewRm10VoucherShorthand(adj.metadata);
  }
  if (label.toLowerCase().includes("august")) return "AugPromo";
  if (
    code.includes("rm10") ||
    label.toLowerCase().includes("rm10") ||
    label.toLowerCase().includes("discount card")
  ) {
    return crewRm10VoucherShorthand(adj.metadata);
  }
  if (label.length <= 16) return label.replace(/\s+/g, "");
  return label.slice(0, 14).replace(/\s+/g, "");
}
