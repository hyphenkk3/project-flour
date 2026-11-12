import { STAFF_NOTIFICATION_DEFINITIONS } from "./notification-preferences";
import type { StaffNotificationEvent } from "./staff-notification-engine";

export const MALFORMED_LIVE_RECOVERY_COOLDOWN_MS = 30_000;

export type LiveNotificationShape = {
  idPresent: boolean;
  supportedCodePresent: boolean;
};

export type SafeRealtimeSubscriptionStatus =
  | "CONNECTING"
  | "SUBSCRIBED"
  | "CHANNEL_ERROR"
  | "TIMED_OUT"
  | "CLOSED"
  | "UNKNOWN";

export function toSafeRealtimeSubscriptionStatus(
  status: string,
): SafeRealtimeSubscriptionStatus {
  switch (status) {
    case "SUBSCRIBED":
    case "CHANNEL_ERROR":
    case "TIMED_OUT":
    case "CLOSED":
      return status;
    default:
      return "UNKNOWN";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotificationCode(
  value: unknown,
): value is StaffNotificationEvent["code"] {
  return (
    typeof value === "string" &&
    STAFF_NOTIFICATION_DEFINITIONS.some(
      (definition) => definition.code === value,
    )
  );
}

export function getLiveNotificationShape(
  value: unknown,
): LiveNotificationShape {
  const row = isRecord(value) ? value : null;
  return {
    idPresent: typeof row?.id === "string" && row.id.trim().length > 0,
    supportedCodePresent: isNotificationCode(row?.code),
  };
}

export function normalizeLiveNotificationEvent(
  value: unknown,
): StaffNotificationEvent | null {
  if (!isRecord(value)) return null;
  const { id, code } = value;
  if (
    typeof id !== "string" ||
    id.trim().length === 0 ||
    !isNotificationCode(code)
  ) {
    return null;
  }

  const orderId = typeof value.order_id === "string" ? value.order_id : null;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const description =
    typeof value.description === "string" ? value.description.trim() : "";
  const href = typeof value.href === "string" ? value.href : undefined;

  return {
    id,
    code,
    orderId,
    title: title || "Staff notification",
    description,
    href,
    actionLabel:
      code === "waiting_list_new_request"
        ? "View"
        : code === "approval_required" && !orderId
          ? "View approvals"
          : "View order",
    tone: toneFromCode(code),
  };
}

function toneFromCode(
  code: StaffNotificationEvent["code"],
): StaffNotificationEvent["tone"] {
  switch (code) {
    case "order_paid":
    case "order_confirmed":
      return "success";
    case "order_cancelled":
    case "approval_required":
    case "last_minute":
    case "fresh_pick_walk_in_hold_reminder":
      return "warning";
    default:
      return "info";
  }
}

export function createMalformedLiveRecoveryGate(
  cooldownMs = MALFORMED_LIVE_RECOVERY_COOLDOWN_MS,
) {
  let lastAttemptAt = Number.NEGATIVE_INFINITY;
  let inFlight = false;

  return {
    tryStart(now: number): boolean {
      if (
        !Number.isFinite(now) ||
        inFlight ||
        now - lastAttemptAt < cooldownMs
      ) {
        return false;
      }
      lastAttemptAt = now;
      inFlight = true;
      return true;
    },
    finish(): void {
      inFlight = false;
    },
  };
}
