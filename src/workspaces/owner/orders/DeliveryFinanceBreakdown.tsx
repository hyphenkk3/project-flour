/**
 * M4-P3 Slice 2A — Delivery finance presentation lines for Payment / pre-payment.
 * Amount due still comes only from settlement (adjustments). These lines must not
 * be added again into arithmetic.
 */

import {
  deliveryFinanceBreakdownLines,
  deliveryFinanceFactsFromDelivery,
} from "@/engines/orders/delivery-finance";
import type { StorefrontOrder } from "@/types/storefront";

type DeliveryFinanceBreakdownProps = {
  order: StorefrontOrder;
};

export function DeliveryFinanceBreakdown({
  order,
}: DeliveryFinanceBreakdownProps) {
  if (order.fulfilmentMethod !== "delivery") return null;
  const facts = deliveryFinanceFactsFromDelivery(order.delivery);
  const lines = deliveryFinanceBreakdownLines(facts);
  if (lines.length === 0) return null;

  return (
    <ul className="space-y-2">
      {lines.map((line) => (
        <li key={line.key}>
          <p className="text-ink text-sm font-medium">
            {line.label} — {line.amountText}
          </p>
        </li>
      ))}
    </ul>
  );
}
