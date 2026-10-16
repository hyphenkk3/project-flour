import { refundMethodLabel } from "@/engines/orders/refund-recording";
import { nextMonth } from "@/engines/reports/monthly";
import type { RefundMethodCode } from "@/types/storefront";

export type RefundBreakdownEntry = {
  orderNumber: string;
  refundDate: string;
  amount: number;
  method: string;
  source: string;
  recordedBy: string;
  reason: string;
};

export type RefundBreakdownSourceRow = {
  amount: number;
  refundedAt: string;
  refundMethod: string | null;
  refundMethodDescription: string | null;
  refundType: string | null;
  reason: string | null;
};

const REFUND_SOURCE_LABELS: Record<string, string> = {
  order_refund: "General Refund",
  overpayment_correction: "Refund Overpayment",
  fresh_pick_cancellation: "Fresh Pick Cancellation Refund",
};

export function refundSourceLabel(source: string | null): string {
  if (!source) return "Not recorded";
  return REFUND_SOURCE_LABELS[source] ?? source;
}

export function refundDateInMalaysia(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Refund has an invalid recorded date");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuching",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function managementRefundMonthBounds(month: string) {
  return {
    start: `${month}-01T00:00:00+08:00`,
    end: `${nextMonth(month)}-01T00:00:00+08:00`,
  };
}

export function mapRefundBreakdownEntry(
  row: RefundBreakdownSourceRow,
  orderNumber: string,
  recordedBy: string,
): RefundBreakdownEntry {
  const method = row.refundMethod;
  const knownMethod =
    method === "online_transfer" ||
    method === "wb_qr" ||
    method === "cash" ||
    method === "others";
  return {
    orderNumber,
    refundDate: refundDateInMalaysia(row.refundedAt),
    amount: row.amount,
    method: !method
      ? "Not recorded"
      : knownMethod
        ? refundMethodLabel(
            method as RefundMethodCode,
            row.refundMethodDescription,
          )
        : method,
    source: refundSourceLabel(row.refundType),
    recordedBy,
    reason: row.reason?.trim() || "Not recorded",
  };
}

export function assertRefundBreakdownReconciles(
  entries: RefundBreakdownEntry[],
  expectedTotal: number,
): void {
  const actualCents = entries.reduce((total, entry) => {
    if (!Number.isFinite(entry.amount))
      throw new Error("Refund breakdown contains an invalid amount");
    return total + Math.round(entry.amount * 100);
  }, 0);
  if (actualCents !== Math.round(expectedTotal * 100)) {
    throw new Error(
      "Refund breakdown does not reconcile with recorded refunds total",
    );
  }
}
