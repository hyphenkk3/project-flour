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

const PUSH_COPY: Record<
  StaffNotificationCode,
  { title: string; body: string; href: string }
> = {
  new_order: {
    title: "New order received",
    body: "A new preorder needs attention.",
    href: "/owner/orders",
  },
  order_paid: {
    title: "Order paid",
    body: "An order payment was recorded.",
    href: "/owner/orders",
  },
  order_confirmed: {
    title: "Order confirmed",
    body: "An order was confirmed.",
    href: "/owner/orders",
  },
  order_cancelled: {
    title: "Order cancelled",
    body: "An order was cancelled.",
    href: "/owner/orders",
  },
  order_edited: {
    title: "Order updated",
    body: "An order was updated.",
    href: "/owner/orders",
  },
  approval_required: {
    title: "Approval required",
    body: "A staff action needs review.",
    href: "/owner/approvals",
  },
  last_minute: {
    title: "Last-minute order",
    body: "Urgent order activity needs attention.",
    href: "/owner/orders",
  },
  fresh_pick_walk_in_hold_reminder: {
    title: "Fresh Pick hold reminder",
    body: "A Fresh Pick hold needs attention.",
    href: "/owner/orders",
  },
  waiting_list_new_request: {
    title: "New waiting list request",
    body: "A customer joined the waiting list.",
    href: "/owner/waiting-list",
  },
};

export function buildStaffPushMessage(input: {
  eventId: string;
  code: StaffNotificationCode;
}) {
  const copy = PUSH_COPY[input.code];
  return {
    title: copy.title,
    body: copy.body,
    tag: `whitebird-staff-${input.eventId}`,
    renotify: false as const,
    data: { href: copy.href },
  };
}
