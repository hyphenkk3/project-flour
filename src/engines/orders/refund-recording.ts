import type { RefundMethodCode } from "@/types/storefront";

export const REFUND_METHOD_OPTIONS: Array<{
  value: RefundMethodCode;
  label: string;
}> = [
  { value: "online_transfer", label: "Online Bank Transfer" },
  { value: "wb_qr", label: "WB QR" },
  { value: "cash", label: "Cash" },
  { value: "others", label: "Other" },
];

export function isRefundMethod(value: string): value is RefundMethodCode {
  return REFUND_METHOD_OPTIONS.some((option) => option.value === value);
}

export function refundMethodLabel(
  method: RefundMethodCode | null,
  description?: string | null,
): string {
  if (!method) return "Method not recorded";
  if (method === "others") {
    return description?.trim() ? `Other — ${description.trim()}` : "Other";
  }
  return REFUND_METHOD_OPTIONS.find((option) => option.value === method)!.label;
}

export function todayMalaysiaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuching",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isValidRefundDate(value: string, today = todayMalaysiaDate()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
