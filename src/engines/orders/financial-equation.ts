/**
 * Shared order financial equation from item price snapshots + effective adjustments.
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
};

export type FinancialEquationAdjustment = Pick<
  OrderAdjustment,
  "amount" | "label" | "code" | "metadata"
>;

/** One item: RM125 or RM165*2 (qty > 1). */
export function formatItemPriceComponent(input: {
  unitPrice: number;
  quantity: number;
}): string {
  const qty = Math.max(1, Number(input.quantity) || 1);
  const price = formatRm(Number(input.unitPrice));
  if (qty === 1) return price;
  return `${price}*${qty}`;
}

/**
 * Authoritative equation reconciling to amountDue.
 * Single ×1 with no adjustments → concise RMamountDue only.
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
    }),
  );
  const itemExpression = itemParts.join("+");
  const hasQtyMultiplier = items.some(
    (item) => Math.max(1, Number(item.quantity) || 1) > 1,
  );
  const needsEquation =
    items.length > 1 || hasQtyMultiplier || effective.length > 0;

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
