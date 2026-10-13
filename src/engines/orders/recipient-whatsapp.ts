import { buildWhatsAppDeepLink } from "@/engines/orders/whatsapp";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import type { StorefrontOrderFulfilmentMethod } from "@/types/storefront";

export type RecipientWhatsAppInput = {
  fulfilmentMethod: StorefrontOrderFulfilmentMethod;
  recipientNotifyPreference: string | null | undefined;
  recipientPhone: string | null | undefined;
  addressLine1: string | null | undefined;
  addressLines: string[];
  scheduledTime: string | null | undefined;
  staffDisplayName: string;
};

export function recipientWhatsAppLink(input: RecipientWhatsAppInput): {
  visible: boolean;
  url: string | null;
  reason: string | null;
} {
  if (
    input.fulfilmentMethod !== "delivery" ||
    input.recipientNotifyPreference !== "inform_recipient"
  ) {
    return { visible: false, url: null, reason: null };
  }
  if (!input.recipientPhone?.trim()) {
    return {
      visible: true,
      url: null,
      reason: "Recipient phone number is missing.",
    };
  }
  if (
    !input.addressLine1?.trim() ||
    !input.addressLines.some((line) => line.trim())
  ) {
    return { visible: true, url: null, reason: "Delivery address is missing." };
  }
  const time = input.scheduledTime?.trim() ?? "";
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) {
    return {
      visible: true,
      url: null,
      reason: "Scheduled delivery time is missing.",
    };
  }
  const staff = input.staffDisplayName.trim();
  if (!staff) {
    return {
      visible: true,
      url: null,
      reason: "Staff display name is missing.",
    };
  }
  const address = input.addressLines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(", ");
  const message =
    `Morning, this is ${staff} from Whitebird.\n\n` +
    `We have a scheduled delivery for you from your family/friend and it is supposed to ` +
    `be delivered to *${address} at ${formatPickupTime(time)}.*\n\n` +
    `The order is actually ready for delivery at the moment. May we know when would be ` +
    `a good time for us to arrange the delivery ya?\n\n` +
    `Hope to hear from you soon.\nThank you ☺️`;
  const url = buildWhatsAppDeepLink(input.recipientPhone, message);
  return {
    visible: true,
    url,
    reason: url ? null : "Recipient phone number is invalid for WhatsApp.",
  };
}
