import type { StatusTone } from "@/lib/design-tokens";
import type {
  FulfilmentMethod,
  OrderStatus,
  PaymentStatus,
} from "@/types/order";

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "submitted",
  "pending_confirmation",
  "confirmed",
  "awaiting_payment",
  "paid",
  "cancelled",
  "completed",
] as const;

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "unpaid",
  "paid",
  "refunded",
] as const;

export const FULFILMENT_METHODS: readonly FulfilmentMethod[] = [
  "pickup",
  "delivery",
  "drive_through",
] as const;

export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "pending_confirmation":
      return "Pending Confirmation";
    case "confirmed":
      return "Confirmed";
    case "awaiting_payment":
      return "Awaiting Payment";
    case "paid":
      return "Paid";
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Completed";
  }
}

export function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case "unpaid":
      return "Unpaid";
    case "paid":
      return "Paid";
    case "refunded":
      return "Refunded";
  }
}

export function fulfilmentMethodLabel(method: FulfilmentMethod): string {
  switch (method) {
    case "pickup":
      return "Pickup";
    case "delivery":
      return "Delivery";
    case "drive_through":
      return "Drive-through";
    case "dine_in":
      return "Dine-in";
  }
}

export function orderStatusTone(status: OrderStatus): StatusTone {
  switch (status) {
    case "submitted":
    case "pending_confirmation":
      return "info";
    case "confirmed":
    case "awaiting_payment":
      return "warning";
    case "paid":
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
  }
}

export function paymentStatusTone(status: PaymentStatus): StatusTone {
  switch (status) {
    case "unpaid":
      return "warning";
    case "paid":
      return "success";
    case "refunded":
      return "neutral";
  }
}

/** Display a Postgres `date` (YYYY-MM-DD) without timezone shift. */
export function formatOrderDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }

  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

/** Display a Postgres `time` value (HH:MM[:SS]). */
export function formatOrderTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return time;
  }

  return new Intl.DateTimeFormat("en-SG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(1970, 0, 1, hours, minutes)));
}

/** Normalize HTML time input / DB time to HH:MM:SS for storage. */
export function normalizePickupTime(value: string): string | null {
  const trimmed = value.trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const hours = match[1];
  const minutes = match[2];
  const seconds = match[3] ?? "00";
  return `${hours}:${minutes}:${seconds}`;
}

/** Value for `<input type="time">` from DB time. */
export function pickupTimeInputValue(time: string): string {
  return time.slice(0, 5);
}
