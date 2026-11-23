import type { StaffNotificationCode } from "@/foundation/staff/notification-preferences";

export type StaffPushSubscriptionInput = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};

export function isStaffNotificationEventId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function parseStaffPushEventScope(
  value: unknown,
):
  { kind: "event"; eventId: string } | { kind: "batch" } | { kind: "invalid" } {
  if (value === undefined) return { kind: "batch" };
  if (typeof value !== "string") return { kind: "invalid" };
  const eventId = value.trim();
  return isStaffNotificationEventId(eventId)
    ? { kind: "event", eventId }
    : { kind: "invalid" };
}

const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
] as const;

export function parseStaffPushSubscription(
  value: unknown,
): StaffPushSubscriptionInput | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StaffPushSubscriptionInput>;
  const keys = candidate.keys;
  if (
    typeof candidate.endpoint !== "string" ||
    typeof keys?.p256dh !== "string" ||
    typeof keys.auth !== "string"
  ) {
    return null;
  }

  const endpoint = candidate.endpoint.trim();
  if (!isTrustedStaffPushEndpoint(endpoint)) return null;
  if (!/^[A-Za-z0-9_-]{80,120}$/.test(keys.p256dh)) return null;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(keys.auth)) return null;

  const expirationTime =
    typeof candidate.expirationTime === "number" &&
    Number.isFinite(candidate.expirationTime) &&
    candidate.expirationTime > 0
      ? candidate.expirationTime
      : null;

  return {
    endpoint,
    expirationTime,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };
}

export function isTrustedStaffPushEndpoint(value: string): boolean {
  if (!value || value.length > 2048) return false;

  try {
    const endpoint = new URL(value);
    const hostname = endpoint.hostname.toLowerCase();
    return (
      endpoint.protocol === "https:" &&
      endpoint.port === "" &&
      !endpoint.username &&
      !endpoint.password &&
      PUSH_HOSTS.some((host) => hostname === host)
    );
  } catch {
    return false;
  }
}

export const STAFF_PUSH_CATEGORY_COPY: Record<
  StaffNotificationCode,
  { title: string; body: string; href: string }
> = {
  new_order: {
    title: "New Order",
    body: "A new preorder needs attention.",
    href: "/owner",
  },
  order_paid: {
    title: "Order Paid",
    body: "An order payment was recorded.",
    href: "/owner",
  },
  order_confirmed: {
    title: "Order Confirmed",
    body: "An order was confirmed.",
    href: "/owner",
  },
  order_cancelled: {
    title: "Order Cancelled",
    body: "An order was cancelled.",
    href: "/owner",
  },
  order_edited: {
    title: "Order Edited",
    body: "An order was updated.",
    href: "/owner",
  },
  approval_required: {
    title: "Approval Required",
    body: "A staff action needs review.",
    href: "/owner/approvals",
  },
  last_minute: {
    title: "Last Minute Order",
    body: "A new Fresh Pick order needs attention.",
    href: "/owner",
  },
  fresh_pick_walk_in_hold_reminder: {
    title: "Fresh Pick hold reminder",
    body: "A Fresh Pick hold needs attention.",
    href: "/customer-operations/fresh-picks",
  },
  waiting_list_new_request: {
    title: "New waiting list request",
    body: "A customer joined the waiting list.",
    href: "/bakery/availability#waiting-list-heading",
  },
};

const ORDER_NOTIFICATION_CODES = new Set<StaffNotificationCode>([
  "new_order",
  "order_paid",
  "order_confirmed",
  "order_cancelled",
  "order_edited",
  "last_minute",
]);

export function isStaffPushOrderNotificationCode(
  code: StaffNotificationCode,
): boolean {
  return ORDER_NOTIFICATION_CODES.has(code);
}

export function resolveStaffPushHref(input: {
  code: StaffNotificationCode;
  orderId?: string | null;
}): string {
  if (isStaffPushOrderNotificationCode(input.code)) {
    return input.orderId && isStaffNotificationEventId(input.orderId)
      ? `/owner/orders/${input.orderId}`
      : "/owner";
  }
  return STAFF_PUSH_CATEGORY_COPY[input.code].href;
}

const LEGACY_PUSH_TITLES: Partial<
  Record<StaffNotificationCode, readonly string[]>
> = {
  new_order: ["new order received"],
  order_paid: ["order paid"],
  order_confirmed: ["order confirmed"],
  order_cancelled: ["order cancelled"],
  order_edited: ["order edited", "order updated"],
  approval_required: ["approval required"],
  last_minute: ["last-minute order", "last minute order"],
};

export function resolveSafeStaffPushTitle(
  code: StaffNotificationCode,
  eventTitle: string | null | undefined,
): string {
  const title = eventTitle?.trim().toLocaleLowerCase("en-US");
  const accepted = [
    STAFF_PUSH_CATEGORY_COPY[code].title.toLocaleLowerCase("en-US"),
    ...(LEGACY_PUSH_TITLES[code] ?? []),
  ];
  if (!title || !accepted.includes(title)) {
    return STAFF_PUSH_CATEGORY_COPY[code].title;
  }
  if (eventTitle?.trim() === STAFF_PUSH_CATEGORY_COPY[code].title) {
    return eventTitle.trim();
  }
  return STAFF_PUSH_CATEGORY_COPY[code].title;
}

export function resolveSafeStaffPushDescription(
  code: StaffNotificationCode,
  eventDescription: string | null | undefined,
): string {
  const categoryDescription = STAFF_PUSH_CATEGORY_COPY[code].body;
  // Order descriptions contain names, order numbers, and fulfilment details.
  // Forward a stored description only when it is already the approved generic
  // category copy; otherwise use the safe category-specific fallback.
  return eventDescription?.trim() === categoryDescription
    ? eventDescription.trim()
    : categoryDescription;
}

export function buildStaffPushMessage(input: {
  eventId: string;
  code: StaffNotificationCode;
  orderId?: string | null;
  eventTitle?: string | null;
  eventDescription?: string | null;
  syntheticTest?: boolean;
}) {
  const isSyntheticTest = input.syntheticTest === true;
  return {
    title: isSyntheticTest
      ? "SYSTEM TEST — NO REAL ORDER"
      : resolveSafeStaffPushTitle(input.code, input.eventTitle),
    // Event descriptions for order events include customer and order details.
    // Keep lock-screen copy category-specific and privacy-safe.
    body: isSyntheticTest
      ? "No order, payment, customer, reservation, or collection record was created."
      : resolveSafeStaffPushDescription(input.code, input.eventDescription),
    systemTest: isSyntheticTest,
    tag: `whitebird-staff-${input.eventId}`,
    renotify: false as const,
    data: { href: resolveStaffPushHref(input) },
  };
}
