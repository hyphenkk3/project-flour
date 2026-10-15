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
  orderStatus?: string;
  /** Commercial lines: cakes and/or paid add-ons (unit price snapshots × qty). */
  items: Array<{ unitPrice: number; quantity: number }>;
  adjustments: Array<Pick<OrderAdjustment, "amount">>;
  allocations: Array<
    Pick<OrderPaymentAllocationView, "amount" | "paymentStatus"> &
      Partial<Pick<OrderPaymentAllocationView, "effectiveAmount">>
  >;
  refunds: Array<Pick<OrderRefundView, "amount" | "status"> & Partial<Pick<OrderRefundView, "refundType">>>;
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
      .reduce(
        (sum, row) => sum + toCents(row.effectiveAmount ?? row.amount),
        0,
      ),
  );

  const refundsTotal = fromCents(
    input.refunds
      .filter((row) => row.status === "recorded")
      .reduce((sum, row) => sum + toCents(row.amount), 0),
  );
  const hasRefundType = input.refunds.some((row) => row.refundType != null);
  const overpaymentRefundsTotal = hasRefundType
    ? fromCents(
        input.refunds
          .filter(
            (row) =>
              row.status === "recorded" &&
              row.refundType === "overpayment_correction",
          )
          .reduce((sum, row) => sum + toCents(row.amount), 0),
      )
    : refundsTotal;

  const netReceived = subtractMoney(verifiedPaymentsAllocated, refundsTotal);
  // Refunds are a cash outflow, not new customer debt. Outstanding is measured
  // against the verified amount originally received, while netReceived remains
  // available for cash reporting and Fresh Pick cancellation settlement.
  const genuineOutstanding = Math.max(
    0,
    subtractMoney(amountDue, verifiedPaymentsAllocated),
  );
  const remainingRefundable = Math.max(0, netReceived);
  const remainingBalance =
    input.orderStatus === "cancelled" || input.orderStatus === "completed"
      ? 0
      : genuineOutstanding;
  const overpayment = Math.max(0, subtractMoney(netReceived, amountDue));
  const isFullyPaid =
    moneyCompare(verifiedPaymentsAllocated, amountDue) >= 0;

  return {
    subtotal,
    totalAdjustments,
    amountDue,
    verifiedPaymentsAllocated,
    refundsTotal,
    overpaymentRefundsTotal,
    netReceived,
    remainingRefundable,
    genuineOutstanding,
    remainingBalance,
    overpayment,
    isFullyPaid,
  };
}
