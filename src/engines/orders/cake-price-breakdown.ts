import { fromCents, toCents } from "@/engines/orders/money";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";

export type CakePriceBreakdownItem = {
  cakeName: string;
  sizeLabel: string;
  quantity: number;
  unitPrice: number;
};

export type CakePriceLine = {
  /** e.g. Chocolate D'Amour 6" x2 */
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** Explicit arithmetic when quantity > 1, e.g. RM125 × 2 = RM250 */
  arithmetic: string | null;
  /** Compact single-line for qty 1: title — RM125 */
  compactWithPrice: string;
};

/**
 * Per-line cake price breakdown from immutable order-item snapshots.
 * Does not apply adjustments — those remain separate for Preview 2.
 */
export function buildCakePriceBreakdown(
  items: CakePriceBreakdownItem[],
): {
  lines: CakePriceLine[];
  subtotal: number;
  /** e.g. RM125 + RM165 = RM290 when 2+ lines; null for a single line */
  sumExpression: string | null;
} {
  const lines: CakePriceLine[] = items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const unitPrice = Number(item.unitPrice);
    const lineTotal = fromCents(toCents(unitPrice) * quantity);
    const title = `${item.cakeName} ${item.sizeLabel} x${quantity}`;
    const arithmetic =
      quantity > 1
        ? `${formatRm(unitPrice)} × ${quantity} = ${formatRm(lineTotal)}`
        : null;
    const compactWithPrice = `${title} — ${formatRm(lineTotal)}`;
    return {
      title,
      quantity,
      unitPrice,
      lineTotal,
      arithmetic,
      compactWithPrice,
    };
  });

  const subtotal = fromCents(
    lines.reduce((sum, line) => sum + toCents(line.lineTotal), 0),
  );

  const sumExpression =
    lines.length >= 2
      ? `${lines.map((line) => formatRm(line.lineTotal)).join(" + ")} = ${formatRm(subtotal)}`
      : null;

  return { lines, subtotal, sumExpression };
}

/** Plain-text cake block for WhatsApp payment request messages. */
export function formatCakePriceBreakdownMessage(
  items: CakePriceBreakdownItem[],
): string {
  const { lines, sumExpression } = buildCakePriceBreakdown(items);
  const cakeBlock = lines
    .map((line) => {
      if (line.arithmetic) {
        return `~ ${line.title}\n  ${line.arithmetic}`;
      }
      return `~ ${line.compactWithPrice}`;
    })
    .join("\n");

  if (sumExpression) {
    return `${cakeBlock}\n\n${sumExpression}`;
  }
  return cakeBlock;
}
