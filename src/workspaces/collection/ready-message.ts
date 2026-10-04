import {
  deliveryCustomerReadyVariantForRecipient,
  generateCustomerDeliveryReadyMessage,
  generateCustomerReadyMessage,
  type DeliveryCustomerReadyVariant,
} from "@/engines/orders/messages";
import type {
  CollectionBoardOrder,
  CollectionReadyMessageSent,
} from "@/workspaces/collection/types";

export const COLLECTION_READY_MESSAGE_SENT_EVENT =
  "customer_ready_message_sent";

export function collectionReadyMessageSentFromEvent(
  event: { createdAt: string; actorStaffId: string | null } | null,
  actorName: string | null,
): CollectionReadyMessageSent | null {
  if (!event) return null;
  return { sentAt: event.createdAt, sentByName: actorName };
}

export function collectionReadyMessageVariant(
  order: CollectionBoardOrder,
): DeliveryCustomerReadyVariant {
  if (order.fulfilmentMethod !== "delivery" || !order.delivery) {
    return "schedule";
  }
  return deliveryCustomerReadyVariantForRecipient({
    customerName: order.guestName,
    customerPhone: order.guestPhone,
    recipientName: order.delivery.recipientName,
    recipientPhone: order.delivery.recipientPhone,
    recipientNotifyPreference: order.delivery.recipientNotifyPreference,
  });
}

export function generateCollectionReadyMessage(
  order: CollectionBoardOrder,
  senderName: string,
): string {
  if (order.fulfilmentMethod === "delivery") {
    return generateCustomerDeliveryReadyMessage({
      senderName,
      scheduledTime: order.pickupTime,
      variant: collectionReadyMessageVariant(order),
    });
  }
  return generateCustomerReadyMessage(senderName);
}

export function selectCollectionWhatsAppMessage(
  readyMessage: string,
  thankYouMessage: string,
  readyMessageSent: boolean,
): { kind: "ready" | "thank_you"; text: string } {
  return readyMessageSent
    ? { kind: "thank_you", text: thankYouMessage }
    : { kind: "ready", text: readyMessage };
}
