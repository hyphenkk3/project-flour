import type { StatusTone } from "@/lib/design-tokens";
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
    case "paid":
      return "Paid · Preorder Secured";
  }
}

/** Active preorder statuses that Owner may still amend. Payment does not freeze the order. */
export const GUEST_ORDER_EDITABLE_STATUSES: ReadonlyArray<
  StorefrontOrder["status"]
> = ["submitted", "pending_confirmation", "awaiting_payment", "paid"];

export function isGuestOrderEditable(
  status: StorefrontOrder["status"],
): boolean {
  return (GUEST_ORDER_EDITABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Semantic guest-order status → shared StatusTone keys (architecture unchanged).
 * Visual Whitebird scheme:
 *   Submitted → amber (warning)
 *   Pending Confirmation → blue (info)
 *   Awaiting Payment → operational red (progress) — not danger/error
 *   Paid → black/ink (success key kept; badge/text use guest-order overrides)
 * Reserve danger/red-muted for genuine exceptions, not awaiting_payment.
 */
export function guestOrderStatusTone(
  status: StorefrontOrder["status"],
): StatusTone {
  switch (status) {
    case "submitted":
      return "warning";
    case "pending_confirmation":
      return "info";
    case "awaiting_payment":
      return "progress";
    case "paid":
      return "success";
  }
}

/**
 * StatusBadge display tone. Paid uses neutral + ink classes so global
 * success green (Library / Toast / storefront) is not forced black.
 */
export function guestOrderStatusBadgeTone(
  status: StorefrontOrder["status"],
): StatusTone {
  if (status === "paid") return "neutral";
  return guestOrderStatusTone(status);
}

/** Extra StatusBadge classes for Whitebird Paid = black treatment. */
export function guestOrderStatusBadgeClassName(
  status: StorefrontOrder["status"],
): string {
  if (status === "paid") {
    return "bg-zinc-100 text-ink ring-ink/20";
  }
  return "";
}

/**
 * Calendar / Guide customer-name colours — Whitebird operational scheme.
 * Paid uses ink (black); Awaiting Payment uses progress (operational red).
 */
export function guestOrderStatusTextClass(
  status: StorefrontOrder["status"],
): string {
  switch (status) {
    case "submitted":
      return "text-status-warning";
    case "pending_confirmation":
      return "text-status-info";
    case "awaiting_payment":
      return "text-status-progress";
    case "paid":
      return "text-ink";
  }
}

export function isPaymentOverdue(
  status: StorefrontOrder["status"],
  paymentDeadlineAt: string | null,
  now: Date = new Date(),
): boolean {
  if (status !== "awaiting_payment") return false;
  if (!paymentDeadlineAt) return false;
  return new Date(paymentDeadlineAt).getTime() < now.getTime();
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

export function formatPaymentHistoryDate(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

/**
 * Human-readable payment due moment in Asia/Singapore, e.g. "Tomorrow, 5:20 PM".
 */
export function formatPaymentDueRelative(
  iso: string,
  now: Date = new Date(),
): string {
  const timeLabel = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));

  const dayLabel = relativeBusinessDayLabel(iso, now);
  return `${dayLabel}, ${timeLabel}`;
}

/**
 * Calendar / operational name suffix for later Preview 3A UI.
 * Crew Order takes precedence over source suffix.
 * customer_website → no suffix. walk_in / last_minute / other → no suffix yet.
 */
export function guestOrderOperationalSuffix(input: {
  orderSource: StorefrontOrder["orderSource"];
  crewOrder: boolean;
}): string | null {
  if (input.crewOrder) return "(crew)";
  switch (input.orderSource) {
    case "jotform":
      return "(jw)";
    case "whatsapp":
      return "(w)";
    case "whitebird_instagram":
      return "(Iw)";
    case "wee":
      return "(wee)";
    case "lex":
      return "(lex)";
    case "customer_website":
    case "walk_in":
    case "last_minute":
    case "other":
      return null;
  }
}

export function guestOrderDisplayName(input: {
  customerName: string;
  orderSource: StorefrontOrder["orderSource"];
  crewOrder: boolean;
}): string {
  const suffix = guestOrderOperationalSuffix(input);
  return suffix ? `${input.customerName} ${suffix}` : input.customerName;
}

/** Staff-created preorder sources — excludes customer_website. */
export const STAFF_GUEST_ORDER_SOURCES = [
  { value: "jotform", label: "Jotform" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "whitebird_instagram", label: "Whitebird Instagram" },
  { value: "wee", label: "Wee" },
  { value: "lex", label: "Lex" },
  { value: "other", label: "Other" },
] as const;

export type StaffGuestOrderSource =
  (typeof STAFF_GUEST_ORDER_SOURCES)[number]["value"];

export function isStaffGuestOrderSource(
  value: string,
): value is StaffGuestOrderSource {
  return STAFF_GUEST_ORDER_SOURCES.some((entry) => entry.value === value);
}

export function orderSourceLabel(
  source: StorefrontOrder["orderSource"],
): string {
  switch (source) {
    case "customer_website":
      return "Customer website";
    case "jotform":
      return "Jotform";
    case "whatsapp":
      return "WhatsApp";
    case "whitebird_instagram":
      return "Whitebird Instagram";
    case "wee":
      return "Wee";
    case "lex":
      return "Lex";
    case "walk_in":
      return "Walk-in";
    case "last_minute":
      return "Last-minute";
    case "other":
      return "Other";
  }
}

/** Website storefront orders keep required WhatsApp phone on edit. */
export function guestOrderRequiresPhone(
  orderSource: StorefrontOrder["orderSource"],
): boolean {
  return orderSource === "customer_website";
}

function singaporeYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function relativeBusinessDayLabel(iso: string, now: Date): string {
  const target = new Date(iso);
  const today = singaporeYmd(now);
  const due = singaporeYmd(target);
  if (due === today) return "Today";

  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (due === singaporeYmd(tomorrowDate)) return "Tomorrow";

  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(target);
}


/** Format ISO for datetime-local input in Asia/Singapore wall time. */
export function toDatetimeLocalValue(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Parse datetime-local value as Asia/Singapore wall time → ISO. */
export function fromDatetimeLocalValue(value: string): string | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  // Construct as SG offset (+08:00) so server stores absolute instant correctly.
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}
