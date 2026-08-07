import type { StorefrontOrder } from "@/types/storefront";

export function guestOrderStatusLabel(
  status: StorefrontOrder["status"],
): string {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "pending_confirmation":
      return "Waiting Customer Confirmation";
    case "awaiting_payment":
      return "Awaiting Payment";
  }
}

export function formatPickupTime(time: string): string {
  const parts = time.split(":");
  if (parts.length < 2) return time;
  const hours = Number(parts[0]);
  const minutes = parts[1];
  if (!Number.isFinite(hours)) return time;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

export function formatSubmittedAt(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatTimelineTime(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function formatTimelineDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}
