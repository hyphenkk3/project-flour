import {
  addMoney,
  fromCents,
  moneyCompare,
  subtractMoney,
  toCents,
} from "@/engines/orders/money";
import { calculateOrderTotal } from "@/engines/orders/totals";
import type {
  OrderAdjustment,
  OrderPaymentAllocationView,
  OrderRefundView,
  OrderSettlement,
} from "@/types/storefront";

export type SettlementInput = {
  /** Commercial lines: cakes and/or paid add-ons (unit price snapshots × qty). */
  items: Array<{ unitPrice: number; quantity: number }>;
  adjustments: Array<Pick<OrderAdjustment, "amount">>;
  allocations: Array<Pick<OrderPaymentAllocationView, "amount" | "paymentStatus">>;
  refunds: Array<Pick<OrderRefundView, "amount" | "status">>;
};

/**
 * Single source of truth for order financial settlement.
 * subtotal = commercial (cakes + paid add-ons); amountDue = subtotal + adjustments.
 * Do not re-implement these rules in UI components.
 */
export function calculateOrderSettlement(input: SettlementInput): OrderSettlement {
  const subtotal = calculateOrderTotal(input.items);
  const totalAdjustments = fromCents(
    input.adjustments.reduce((sum, row) => sum + toCents(row.amount), 0),
  );
  const amountDue = Math.max(0, addMoney(subtotal, totalAdjustments));

  const verifiedPaymentsAllocated = fromCents(
    input.allocations
      .filter((row) => row.paymentStatus === "verified")
      .reduce((sum, row) => sum + toCents(row.amount), 0),
  );

  const refundsTotal = fromCents(
    input.refunds
      .filter((row) => row.status === "recorded")
      .reduce((sum, row) => sum + toCents(row.amount), 0),
  );

  const netReceived = subtractMoney(verifiedPaymentsAllocated, refundsTotal);
  const remainingBalance = Math.max(0, subtractMoney(amountDue, netReceived));
  const overpayment = Math.max(0, subtractMoney(netReceived, amountDue));
  const isFullyPaid = moneyCompare(netReceived, amountDue) >= 0;

  return {
    subtotal,
    totalAdjustments,
    amountDue,
    verifiedPaymentsAllocated,
    refundsTotal,
    netReceived,
    remainingBalance,
    overpayment,
    isFullyPaid,
  };
}
