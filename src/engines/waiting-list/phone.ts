/** Waiting-list WhatsApp: digits only. */

export function waitingListWhatsAppDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidWaitingListWhatsApp(value: string): boolean {
  const digits = waitingListWhatsAppDigits(value);
  return digits.length >= 8 && digits.length <= 15;
}

export const WAITING_LIST_WHATSAPP_NOTE =
  "Please ensure the WhatsApp number is correct as we will contact you regarding your order.";

export const WAITING_LIST_NAME_HELP = "Nickname / English name and surname";

export const WAITING_LIST_REQUEST_NOT_ORDER =
  "This is a waiting-list request, not a confirmed order.";

export const WAITING_LIST_JOIN_CTA = "Join Waiting List";

export const WAITING_LIST_ACK_TITLE = "You're on the waiting list.";

export const WAITING_LIST_ACK_CONTACT =
  "Whitebird will contact you via WhatsApp if availability opens. This does not guarantee an order.";

export const WAITING_LIST_CLOSED_REGULAR_ORDERS =
  "Regular orders for this date are no longer available.";

export const WAITING_LIST_AVAILABLE_LABEL = "Waiting List available";

export const WAITING_LIST_SEE_AVAILABLE_HELP =
  "See which cakes are currently available on our waiting list for this date.";

export const WAITING_LIST_SEE_AVAILABLE_CTA =
  "See What's Available on the Waiting List";

export const WAITING_LIST_CLOSED_NONE =
  "We're not currently accepting Waiting List requests for this date.";

export const WAITING_LIST_AVAILABILITY_INTRO =
  "These cakes are currently available on our waiting list for this date.";
