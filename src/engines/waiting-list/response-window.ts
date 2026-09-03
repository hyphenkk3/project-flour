import { DEFAULT_WAITING_LIST_RESPONSE_MINUTES } from "@/engines/waiting-list/types";

/**
 * Collection override, else business default, else 30 minutes.
 * Timer starts when CO contacts — not when capacity increases.
 */
export function resolveWaitingListResponseMinutes(
  collectionMinutes: number | null | undefined,
  businessMinutes: number | null | undefined,
): number {
  if (
    collectionMinutes != null &&
    Number.isFinite(collectionMinutes) &&
    collectionMinutes > 0
  ) {
    return Math.floor(collectionMinutes);
  }
  if (
    businessMinutes != null &&
    Number.isFinite(businessMinutes) &&
    businessMinutes > 0
  ) {
    return Math.floor(businessMinutes);
  }
  return DEFAULT_WAITING_LIST_RESPONSE_MINUTES;
}

export function waitingListResponseDeadline(
  contactedAt: Date,
  minutes: number,
): Date {
  const window = minutes > 0 ? minutes : DEFAULT_WAITING_LIST_RESPONSE_MINUTES;
  return new Date(contactedAt.getTime() + window * 60 * 1000);
}

export function waitingListResponseIsLate(
  respondedAt: Date,
  deadlineAt: Date | null,
): boolean {
  if (!deadlineAt) return false;
  return respondedAt.getTime() > deadlineAt.getTime();
}
