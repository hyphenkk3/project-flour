import {
  STAFF_NOTIFICATION_DEFAULT_ENABLED,
  STAFF_NOTIFICATION_DEFAULT_WEB_MODE,
  type StaffNotificationCode,
  type StaffNotificationPreference,
  type StaffNotificationWebMode,
} from "@/foundation/staff/notification-preferences";

/**
 * One authoritative database source per locked category.
 * Phase 8 cancel writes both orders.status and a timeline row; paid
 * confirmation similarly writes status, payment_status, and timeline.
 * Classification below picks a single source so those fan-outs cannot
 * emit duplicate notifications.
 */
export const STAFF_NOTIFICATION_AUTHORITATIVE_SOURCES = {
  new_order: "orders.insert",
  order_paid: "orders.update.paid",
  order_cancelled: "orders.update.cancelled",
  last_minute: "orders.order_source.last_minute",
  order_confirmed: "order_timeline_events.insert.customer_confirmed",
  order_edited: "order_timeline_events.insert.order_updated",
  approval_required: "operations_approval_requests.insert.pending",
} as const satisfies Record<StaffNotificationCode, string>;

/**
 * Last Minute is an order-source value, not a time threshold.
 * Matches the existing staff "Order source" control.
 */
export const LAST_MINUTE_ORDER_SOURCE = "last_minute";

export type StaffNotificationEventKey = `${StaffNotificationCode}:${string}`;

export type OrderNotificationSnapshot = {
  id: string;
  status: string;
  paymentStatus?: string | null;
  extraStockId?: string | null;
  orderSource?: string | null;
};

export type TimelineNotificationSnapshot = {
  id: string;
  orderId: string;
  eventType: string;
};

export type ApprovalNotificationSnapshot = {
  id: string;
  orderId?: string | null;
  status?: string | null;
};

export type StaffNotificationCandidate = {
  eventKey: StaffNotificationEventKey;
  code: StaffNotificationCode;
  orderId: string | null;
  approvalId: string | null;
};

export function staffNotificationEventKey(
  code: StaffNotificationCode,
  identity: string,
): StaffNotificationEventKey {
  return `${code}:${identity}`;
}

export function isNewOrderNotificationSource(
  order: Pick<OrderNotificationSnapshot, "status" | "extraStockId">,
): boolean {
  if (order.status !== "submitted") return false;
  if (order.extraStockId != null) return false;
  return true;
}

export function isPaidNotificationTransition(
  previous: Pick<OrderNotificationSnapshot, "status" | "paymentStatus">,
  next: Pick<OrderNotificationSnapshot, "status" | "paymentStatus">,
): boolean {
  if (next.status === "cancelled") return false;
  const wasPaid =
    previous.status === "paid" || previous.paymentStatus === "paid";
  const isPaid = next.status === "paid" || next.paymentStatus === "paid";
  return isPaid && !wasPaid;
}

export function isCancelledNotificationTransition(
  previous: Pick<OrderNotificationSnapshot, "status">,
  next: Pick<OrderNotificationSnapshot, "status">,
): boolean {
  return next.status === "cancelled" && previous.status !== "cancelled";
}

export function isLastMinuteNotificationTransition(
  previous: Pick<OrderNotificationSnapshot, "orderSource"> | null,
  next: Pick<OrderNotificationSnapshot, "orderSource" | "status">,
): boolean {
  if (next.status === "cancelled") return false;
  if (next.orderSource !== LAST_MINUTE_ORDER_SOURCE) return false;
  return previous?.orderSource !== LAST_MINUTE_ORDER_SOURCE;
}

export function classifyOrderInsert(
  order: OrderNotificationSnapshot,
): StaffNotificationCandidate[] {
  if (order.status === "cancelled") return [];

  const events: StaffNotificationCandidate[] = [];

  if (isNewOrderNotificationSource(order)) {
    events.push({
      eventKey: staffNotificationEventKey("new_order", order.id),
      code: "new_order",
      orderId: order.id,
      approvalId: null,
    });
  }

  if (isLastMinuteNotificationTransition(null, order)) {
    events.push({
      eventKey: staffNotificationEventKey("last_minute", order.id),
      code: "last_minute",
      orderId: order.id,
      approvalId: null,
    });
  }

  return events;
}

export function classifyOrderUpdate(
  previous: OrderNotificationSnapshot,
  next: OrderNotificationSnapshot,
): StaffNotificationCandidate[] {
  if (next.id !== previous.id) return [];

  if (isCancelledNotificationTransition(previous, next)) {
    return [
      {
        eventKey: staffNotificationEventKey("order_cancelled", next.id),
        code: "order_cancelled",
        orderId: next.id,
        approvalId: null,
      },
    ];
  }

  if (next.status === "cancelled") return [];

  const events: StaffNotificationCandidate[] = [];

  if (isPaidNotificationTransition(previous, next)) {
    events.push({
      eventKey: staffNotificationEventKey("order_paid", next.id),
      code: "order_paid",
      orderId: next.id,
      approvalId: null,
    });
  }

  if (isLastMinuteNotificationTransition(previous, next)) {
    events.push({
      eventKey: staffNotificationEventKey("last_minute", next.id),
      code: "last_minute",
      orderId: next.id,
      approvalId: null,
    });
  }

  return events;
}

export function classifyTimelineInsert(
  row: TimelineNotificationSnapshot,
  orderStatus?: string | null,
): StaffNotificationCandidate[] {
  if (orderStatus === "cancelled") return [];

  if (row.eventType === "customer_confirmed") {
    return [
      {
        eventKey: staffNotificationEventKey("order_confirmed", row.orderId),
        code: "order_confirmed",
        orderId: row.orderId,
        approvalId: null,
      },
    ];
  }

  if (row.eventType === "order_updated") {
    return [
      {
        eventKey: staffNotificationEventKey("order_edited", row.id),
        code: "order_edited",
        orderId: row.orderId,
        approvalId: null,
      },
    ];
  }

  return [];
}

export function classifyApprovalInsert(
  row: ApprovalNotificationSnapshot,
): StaffNotificationCandidate[] {
  if (row.status && row.status !== "pending") return [];

  return [
    {
      eventKey: staffNotificationEventKey("approval_required", row.id),
      code: "approval_required",
      orderId: row.orderId ?? null,
      approvalId: row.id,
    },
  ];
}

export type NotificationChannelDecision = {
  web: boolean;
  email: boolean;
};

export function notificationChannelsForPreference(
  preference: Pick<StaffNotificationPreference, "webEnabled" | "emailEnabled">,
): NotificationChannelDecision {
  return {
    web: preference.webEnabled,
    email: preference.emailEnabled,
  };
}

export function resolveStaffNotificationPreference(
  code: StaffNotificationCode,
  saved?: {
    webEnabled?: boolean;
    webMode?: StaffNotificationWebMode;
    emailEnabled?: boolean;
  } | null,
): StaffNotificationPreference {
  return {
    code,
    webEnabled: saved?.webEnabled ?? STAFF_NOTIFICATION_DEFAULT_ENABLED,
    webMode: saved?.webMode ?? STAFF_NOTIFICATION_DEFAULT_WEB_MODE,
    emailEnabled: saved?.emailEnabled ?? STAFF_NOTIFICATION_DEFAULT_ENABLED,
  };
}

export type StaffEmailRecipient = {
  staffId: string;
  email: string;
  displayName?: string | null;
};

export function selectStaffEmailRecipients(input: {
  code: StaffNotificationCode;
  staff: Array<{
    id: string;
    email: string | null;
    isActive?: boolean;
  }>;
  preferencesByStaffId: Map<
    string,
    Partial<Record<StaffNotificationCode, Pick<StaffNotificationPreference, "emailEnabled">>>
  >;
}): StaffEmailRecipient[] {
  const recipients: StaffEmailRecipient[] = [];

  for (const member of input.staff) {
    if (member.isActive === false) continue;
    const email = member.email?.trim();
    if (!email) continue;

    const saved = input.preferencesByStaffId.get(member.id)?.[input.code];
    const preference = resolveStaffNotificationPreference(input.code, saved);

    if (!preference.emailEnabled) continue;

    recipients.push({
      staffId: member.id,
      email,
    });
  }

  return recipients;
}
