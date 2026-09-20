import { formatDateTime, formatShortBusinessDate } from "@/lib/dates";
import { buildWhatsAppDeepLink } from "@/engines/orders/whatsapp";

export type WaitingListConfirmationWhatsAppItem = {
  cakeName: string;
  sizeLabel: string;
  quantity: number;
};

export type WaitingListConfirmationWhatsAppInput = {
  customerName: string;
  pickupDate: string;
  items: readonly WaitingListConfirmationWhatsAppItem[];
  confirmationUrl: string;
  deadlineAt: Date | string;
};

export function waitingListConfirmationCustomerPath(rawToken: string): string {
  const token = rawToken.trim();
  if (!token) return "";
  return `/order/waiting-list/confirm/${encodeURIComponent(token)}`;
}

export function waitingListConfirmationCustomerUrl(
  rawToken: string,
  origin: string,
): string {
  const path = waitingListConfirmationCustomerPath(rawToken);
  if (!path) return "";
  const base = origin.trim().replace(/\/$/, "");
  return `${base}${path}`;
}

export function waitingListConfirmationItemLine(item: {
  cakeName: string;
  sizeLabel: string;
  quantity: number;
}): string {
  return `${item.cakeName} · ${item.sizeLabel} × ${item.quantity}`;
}

export function buildWaitingListConfirmationWhatsAppMessage(
  input: WaitingListConfirmationWhatsAppInput,
): string {
  const name = input.customerName.trim() || "there";
  const dateLabel = formatShortBusinessDate(input.pickupDate);
  const itemLines = input.items
    .map((item) => `• ${waitingListConfirmationItemLine(item)}`)
    .join("\n");
  const deadline = formatDateTime(input.deadlineAt);

  return [
    `Hi ${name} 👋`,
    "",
    `Good news — we can proceed with your Whitebird Waiting List request for ${dateLabel}.`,
    "",
    "Your request:",
    itemLines,
    "",
    "Please use the link below to confirm your fulfilment details and any options:",
    "",
    input.confirmationUrl.trim(),
    "",
    `Please complete your confirmation by ${deadline}.`,
    "",
    "The confirmation link will expire after this deadline.",
    "",
    "Thank you! 🤍",
  ].join("\n");
}

export function waitingListConfirmationWhatsAppUrl(
  phoneRaw: string,
  message: string,
): string | null {
  return buildWhatsAppDeepLink(phoneRaw, message);
}
