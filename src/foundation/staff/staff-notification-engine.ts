import { formatShortBusinessDate } from "@/lib/dates";
import type { ToastInput } from "@/components/ui/Toast";
import type {
  StaffNotificationCode,
  StaffNotificationWebMode,
} from "@/foundation/staff/notification-preferences";
import type { StorefrontOrderListItem } from "@/types/storefront";
import { ownerOrderWorkspaceHref } from "@/workspaces/owner/navigation/return-to";

export type StaffNotificationEvent = {
  id: string;
  code: StaffNotificationCode;
  orderId?: string | null;
  title: string;
  description: string;
  href?: string | null;
  actionLabel?: string | null;
  tone?: ToastInput["tone"];
};

const claimedWebEventIds = new Set<string>();

let webClaimChannel: BroadcastChannel | null | undefined;

function webClaimBroadcast(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (webClaimChannel !== undefined) return webClaimChannel;

  try {
    webClaimChannel = new BroadcastChannel("wos-staff-notification-web");
    webClaimChannel.onmessage = (event) => {
      if (typeof event.data === "string") {
        claimedWebEventIds.add(event.data);
      }
    };
  } catch {
    webClaimChannel = null;
  }

  return webClaimChannel;
}

/**
 * Cross-tab web toast claim. Email dedup is server-side and does not use this.
 */
export function tryClaimStaffNotification(eventId: string): boolean {
  if (typeof window === "undefined") return false;

  webClaimBroadcast();

  if (claimedWebEventIds.has(eventId)) return false;

  claimedWebEventIds.add(eventId);
  try {
    webClaimBroadcast()?.postMessage(eventId);
  } catch {
    // BroadcastChannel may be unavailable.
  }

  return true;
}

export function notificationDurationMs(
  mode: StaffNotificationWebMode,
): number | null {
  return mode === "persistent" ? null : 4500;
}

export function buildStaffNotificationToast(
  event: StaffNotificationEvent,
  mode: StaffNotificationWebMode,
): ToastInput {
  const durationMs = notificationDurationMs(mode);

  return {
    title: event.title,
    description: event.description,
    tone: event.tone ?? "info",
    durationMs,
    actionHref: mode === "persistent" ? event.href ?? undefined : undefined,
    actionLabel:
      mode === "persistent" ? event.actionLabel ?? "View" : undefined,
  };
}

export type NotificationOrderSummary = Pick<
  StorefrontOrderListItem,
  | "id"
  | "customerName"
  | "cakeName"
  | "pickupDate"
  | "status"
  | "orderSource"
  | "orderNumber"
>;

function orderHref(orderId: string): string {
  return ownerOrderWorkspaceHref(orderId, "/owner");
}

function orderDescription(order: NotificationOrderSummary): string {
  const parts = [
    order.orderNumber,
    order.customerName,
    order.cakeName,
    formatShortBusinessDate(order.pickupDate),
  ].filter((part) => Boolean(part && String(part).trim()));

  return parts.join(" · ");
}

export function buildOrderEventNotification(
  code: Exclude<
    StaffNotificationCode,
    "approval_required" | "last_minute" | "new_order"
  >,
  order: NotificationOrderSummary,
  eventId: string,
): StaffNotificationEvent {
  const base = {
    id: eventId,
    code,
    orderId: order.id,
    href: orderHref(order.id),
    actionLabel: "View order",
    description: orderDescription(order),
  };

  switch (code) {
    case "order_paid":
      return {
        ...base,
        title: "Order paid",
        tone: "success",
      };

    case "order_confirmed":
      return {
        ...base,
        title: "Order confirmed",
        tone: "success",
      };

    case "order_cancelled":
      return {
        ...base,
        title: "Order cancelled",
        tone: "warning",
      };

    case "order_edited":
      return {
        ...base,
        title: "Order edited",
        tone: "info",
      };
  }
}

export function buildNewOrderNotification(
  order: NotificationOrderSummary,
  eventId: string,
): StaffNotificationEvent {
  return {
    id: eventId,
    code: "new_order",
    orderId: order.id,
    title: "New order received",
    description: orderDescription(order),
    href: orderHref(order.id),
    actionLabel: "View order",
    tone: "info",
  };
}

export function buildLastMinuteNotification(
  order: NotificationOrderSummary,
  eventId: string,
): StaffNotificationEvent {
  return {
    id: eventId,
    code: "last_minute",
    orderId: order.id,
    title: "Last-minute order",
    description: orderDescription(order),
    href: orderHref(order.id),
    actionLabel: "View order",
    tone: "warning",
  };
}

export function buildApprovalRequiredNotification(
  approval: {
    id: string;
    orderId?: string | null;
    requestType?: string | null;
    eventId?: string;
  },
): StaffNotificationEvent {
  const orderId = approval.orderId ?? null;

  return {
    id: approval.eventId ?? `approval_required:${approval.id}`,
    code: "approval_required",
    orderId,
    title: "Approval required",
    description: approval.requestType
      ? `Approval requested · ${approval.requestType}`
      : "A new approval request requires your attention.",
    href: orderId ? orderHref(orderId) : "/owner/approvals",
    actionLabel: orderId ? "View order" : "View approvals",
    tone: "warning",
  };
}
