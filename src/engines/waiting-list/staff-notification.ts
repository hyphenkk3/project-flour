import { formatShortBusinessDate } from "@/lib/dates";

export const WAITING_LIST_NEW_REQUEST_CODE = "waiting_list_new_request" as const;

export type WaitingListNotificationPayload = {
  requestId: string;
  itemId: string;
  guestName: string;
  guestPhone: string | null;
  cakeId: string;
  cakeName: string;
  sizeId: string;
  sizeLabel: string;
  pickupDate: string;
  quantity: number;
  itemCount: number;
};

export function waitingListNewRequestEventKey(requestId: string): string {
  return `${WAITING_LIST_NEW_REQUEST_CODE}:${requestId.trim()}`;
}

export function isCustomerWaitingListNotificationSource(input: {
  createdByStaffId?: string | null;
}): boolean {
  return !String(input.createdByStaffId ?? "").trim();
}

export function waitingListNotificationHref(input: {
  pickupDate: string;
  cakeId: string;
  sizeId: string;
}): string {
  const params = new URLSearchParams();
  params.set("date", input.pickupDate.trim().slice(0, 10));
  params.set("wlCake", input.cakeId.trim());
  params.set("wlSize", input.sizeId.trim());
  return `/bakery/availability?${params.toString()}#waiting-list-heading`;
}

export function waitingListNotificationDescription(input: {
  guestName: string;
  cakeName: string;
  sizeLabel: string;
  pickupDate: string;
  quantity: number;
  extraItemCount?: number;
}): string {
  const cake = [input.cakeName.trim(), input.sizeLabel.trim()]
    .filter(Boolean)
    .join(" · ");
  const parts = [
    input.guestName.trim() || null,
    cake || null,
    formatShortBusinessDate(input.pickupDate) || null,
    input.quantity > 0 ? `Qty ${input.quantity}` : null,
  ].filter((part): part is string => Boolean(part));
  const extra = input.extraItemCount ?? 0;
  if (extra > 0) parts.push(`+ ${extra} more`);
  return parts.join(" · ");
}

export function waitingListHomePreviewLine(input: {
  cakeName: string;
  sizeLabel: string;
  pickupDate: string;
  quantity: number;
  extraItemCount?: number;
}): string {
  const extra = input.extraItemCount ?? 0;
  return [
    [input.cakeName.trim(), input.sizeLabel.trim()].filter(Boolean).join(" · "),
    formatShortBusinessDate(input.pickupDate),
    input.quantity > 0 ? `Qty ${input.quantity}` : "",
    extra > 0 ? `+ ${extra} more` : "",
  ]
    .filter((part) => Boolean(part && part.trim()))
    .join(" · ");
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function parseWaitingListNotificationPayload(
  payload: Record<string, unknown> | null | undefined,
): WaitingListNotificationPayload | null {
  if (!payload) return null;
  const requestId = asTrimmedString(payload.requestId);
  const itemId = asTrimmedString(payload.itemId);
  const cakeId = asTrimmedString(payload.cakeId);
  const sizeId = asTrimmedString(payload.sizeId);
  const pickupDate = asTrimmedString(payload.pickupDate);
  if (!requestId || !itemId || !cakeId || !sizeId || !pickupDate) return null;
  const guestPhone = asTrimmedString(payload.guestPhone);
  return {
    requestId,
    itemId,
    guestName: asTrimmedString(payload.guestName),
    guestPhone: guestPhone || null,
    cakeId,
    cakeName: asTrimmedString(payload.cakeName),
    sizeId,
    sizeLabel: asTrimmedString(payload.sizeLabel),
    pickupDate,
    quantity: asFiniteNumber(payload.quantity),
    itemCount: Math.max(1, asFiniteNumber(payload.itemCount) || 1),
  };
}
