/** Must match public.claim_staff_notification_email_deliveries. */
export const STAFF_NOTIFICATION_EMAIL_SWEEP_LIMIT = 50;

/** Must match the claim lease in the dispatch-queue migration. */
export const STAFF_NOTIFICATION_EMAIL_LEASE_SECONDS = 120;

/** Must match staff_notification_email_retry_delay / complete RPC. */
export const STAFF_NOTIFICATION_EMAIL_MAX_ATTEMPTS = 5;

export type StaffNotificationEmailDeliveryStatus =
  "sent" | "failed" | "claimed";

export type StaffNotificationEmailDeliveryState = {
  staffId: string;
  status: StaffNotificationEmailDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: Date | null;
  claimedUntil: Date | null;
};

/**
 * Delay after a failed attempt. `attemptCountAfterFailure` is the count
 * stored on the row after complete records the failure (1..4 retryable).
 * Must match public.staff_notification_email_retry_delay.
 */
export function staffNotificationEmailRetryDelayMs(
  attemptCountAfterFailure: number,
): number | null {
  switch (attemptCountAfterFailure) {
    case 1:
      return 60 * 1000;
    case 2:
      return 5 * 60 * 1000;
    case 3:
      return 15 * 60 * 1000;
    case 4:
      return 60 * 60 * 1000;
    default:
      return null;
  }
}

export function staffNotificationEmailNextAttemptAt(
  attemptCountAfterFailure: number,
  now: Date,
): Date | null {
  const delayMs = staffNotificationEmailRetryDelayMs(attemptCountAfterFailure);
  if (delayMs == null) return null;
  return new Date(now.getTime() + delayMs);
}

export function isStaffNotificationEmailDeliveryClaimable(
  delivery: StaffNotificationEmailDeliveryState | null,
  now: Date,
): boolean {
  if (!delivery) return true;
  if (delivery.status === "sent") return false;
  if (delivery.attemptCount >= STAFF_NOTIFICATION_EMAIL_MAX_ATTEMPTS) {
    return false;
  }

  if (
    delivery.claimedUntil &&
    delivery.claimedUntil.getTime() > now.getTime()
  ) {
    return false;
  }

  if (delivery.status === "failed") {
    if (delivery.nextAttemptAt == null) return false;
    if (delivery.nextAttemptAt.getTime() > now.getTime()) return false;
  }

  return true;
}

export function eventHasPendingStaffNotificationEmail(input: {
  recipients: Array<{ staffId: string }>;
  deliveries: StaffNotificationEmailDeliveryState[];
  now: Date;
}): boolean {
  if (input.recipients.length === 0) return false;

  const byStaffId = new Map(
    input.deliveries.map((row) => [row.staffId, row] as const),
  );

  return input.recipients.some((recipient) =>
    isStaffNotificationEmailDeliveryClaimable(
      byStaffId.get(recipient.staffId) ?? null,
      input.now,
    ),
  );
}

export function selectPendingStaffNotificationEventIds(input: {
  events: Array<{ id: string; createdAt: Date }>;
  pendingByEventId: ReadonlyMap<string, boolean>;
  limit?: number;
}): string[] {
  const limit = input.limit ?? STAFF_NOTIFICATION_EMAIL_SWEEP_LIMIT;
  return [...input.events]
    .filter((event) => input.pendingByEventId.get(event.id) === true)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .slice(0, limit)
    .map((event) => event.id);
}

export function tryClaimStaffNotificationEmailDelivery(input: {
  existing: StaffNotificationEmailDeliveryState | null;
  now: Date;
  leaseSeconds?: number;
}): { ok: true; claimedUntil: Date } | { ok: false } {
  if (!isStaffNotificationEmailDeliveryClaimable(input.existing, input.now)) {
    return { ok: false };
  }

  const leaseSeconds =
    input.leaseSeconds ?? STAFF_NOTIFICATION_EMAIL_LEASE_SECONDS;

  return {
    ok: true,
    claimedUntil: new Date(input.now.getTime() + leaseSeconds * 1000),
  };
}
