import { createHash, randomBytes } from "node:crypto";

export const WAITING_LIST_CONFIRMATION_TOKEN_BYTES = 32;

export const WAITING_LIST_CONFIRMATION_LINK_STATUSES = [
  "issued",
  "submitted",
  "expired",
  "invalidated",
  "converted",
] as const;

export type WaitingListConfirmationLinkStatus =
  (typeof WAITING_LIST_CONFIRMATION_LINK_STATUSES)[number];

export type WaitingListConfirmationItemSnapshot = {
  waitingListItemId: string;
  cakeId: string;
  cakeSizeId: string;
  offeredQuantity: number;
};

/** Cryptographically random URL-safe token. Never persist this value. */
export function generateWaitingListConfirmationToken(): string {
  return randomBytes(WAITING_LIST_CONFIRMATION_TOKEN_BYTES).toString("base64url");
}

/** SHA-256 hex digest. This is the only token form stored in the database. */
export function hashWaitingListConfirmationToken(rawToken: string): string {
  const token = rawToken.trim();
  if (!token) {
    throw new Error("Confirmation token is required");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isWaitingListConfirmationTokenHash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value.trim());
}
