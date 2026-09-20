import { formatTime } from "@/lib/dates";
import type { WaitingListConfirmationItemSnapshot } from "@/engines/waiting-list/confirmation-link";

export const WAITING_LIST_CONFIRMATION_TITLE = "Confirm your Waiting List request";

export const WAITING_LIST_CONFIRMATION_DEADLINE_HELP =
  "This confirmation link is available until the response deadline above. After the deadline, this link will expire and can no longer be used.";

export const WAITING_LIST_CONFIRMATION_DATE_LOCKED_HELP =
  "Collection date is the date of your Waiting List request and cannot be changed here.";

export const WAITING_LIST_CONFIRMATION_SUCCESS_TITLE =
  "Thank you — we've received your confirmation.";

export const WAITING_LIST_CONFIRMATION_SUCCESS_BODY =
  "Whitebird will review your details and proceed with the order. This is not yet a confirmed order.";

export const WAITING_LIST_CONFIRMATION_ALREADY_TITLE =
  "Your confirmation has already been submitted.";

export const WAITING_LIST_CONFIRMATION_ALREADY_BODY =
  "Whitebird will review your details and proceed with the order. This is not yet a confirmed order.";

export const WAITING_LIST_CONFIRMATION_EXPIRED_TITLE =
  "This confirmation link has expired.";

export const WAITING_LIST_CONFIRMATION_EXPIRED_CONTACT =
  "Please contact Whitebird via WhatsApp if you still wish to proceed.";

export const WAITING_LIST_CONFIRMATION_UNAVAILABLE_TITLE =
  "This confirmation link is no longer available.";

export const WAITING_LIST_CONFIRMATION_UNAVAILABLE_BODY =
  "Please contact Whitebird via WhatsApp if you still wish to proceed.";

export type WaitingListConfirmationOutcome =
  | "usable"
  | "submitted"
  | "expired"
  | "unavailable";

export type WaitingListConfirmationDisplayItem = {
  cakeName: string;
  sizeLabel: string;
  quantity: number;
  unitPrice: number;
};

export function waitingListConfirmationDeadlineSentence(
  expiresAt: Date | string,
): string {
  return `Please complete your confirmation by ${formatTime(expiresAt)}.`;
}

export function waitingListConfirmationExpiredDeadlineSentence(
  expiresAt: Date | string,
): string {
  return `The confirmation deadline was ${formatTime(expiresAt)}. This link can no longer be used.`;
}

/** Snapshot items are locked. Client-supplied cake/size/qty changes are ignored. */
export function waitingListConfirmationQuantitiesFromSnapshot(
  snapshot: readonly WaitingListConfirmationItemSnapshot[],
): Array<{ cakeId: string; sizeId: string; quantity: number }> {
  return snapshot.map((item) => ({
    cakeId: item.cakeId,
    sizeId: item.cakeSizeId,
    quantity: item.offeredQuantity,
  }));
}

export function waitingListConfirmationRejectsItemInjection(input: {
  snapshot: readonly WaitingListConfirmationItemSnapshot[];
  attemptedItems: ReadonlyArray<{
    cakeId: string;
    sizeId: string;
    quantity: number;
  }>;
}): boolean {
  const allowed = new Map<string, number>(
    input.snapshot.map((item) => [
      `${item.cakeId}::${item.cakeSizeId}`,
      item.offeredQuantity,
    ]),
  );
  if (input.attemptedItems.length !== input.snapshot.length) return true;
  for (const item of input.attemptedItems) {
    const key = `${item.cakeId}::${item.sizeId}`;
    const offered = allowed.get(key);
    if (offered == null) return true;
    if (item.quantity !== offered) return true;
  }
  return false;
}
