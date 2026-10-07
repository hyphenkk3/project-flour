import {
  customerLastBookable,
  hmToMinutes,
  resolveOperatingHours,
  type OperatingHoursSnapshot,
} from "@/engines/business-calendar/operating-hours";
import {
  deliveryCustomerReadyVariantForRecipient,
  generateCustomerClosedPickupReadyMessage,
  generateCustomerDeliveryReadyMessage,
  generateCustomerReadyMessage,
  type DeliveryCustomerReadyVariant,
} from "@/engines/orders/messages";
import type {
  CollectionBoardOrder,
  CollectionReadyMessageOperatingHours,
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
  if (
    order.fulfilmentMethod === "pickup" &&
    order.readyMessageOperatingHours?.whitebirdStatus === "closed"
  ) {
    return generateCustomerClosedPickupReadyMessage(
      senderName,
      order.readyMessageOperatingHours.pickupLatestBookable,
    );
  }
  return generateCustomerReadyMessage(senderName);
}

function hasNoTimes(row: {
  opensAt: string | null;
  closesAt: string | null;
  latestBookable: string | null;
}): boolean {
  return (
    row.opensAt === null && row.closesAt === null && row.latestBookable === null
  );
}

function isValidOpenHours(row: {
  enabled: boolean;
  opensAt: string | null;
  closesAt: string | null;
  latestBookable: string | null;
}): boolean {
  if (!row.enabled || !row.opensAt) return false;
  const opens = hmToMinutes(row.opensAt);
  const lastBookable = customerLastBookable({
    ...row,
    usualStart: null,
    usualEnd: null,
    source: "weekly",
  });
  const latest = lastBookable ? hmToMinutes(lastBookable) : null;
  if (opens === null || latest === null || latest < opens) return false;
  if (row.latestBookable && hmToMinutes(row.latestBookable) === null) {
    return false;
  }
  if (row.closesAt && hmToMinutes(row.closesAt) === null) return false;
  return true;
}

export function resolveCollectionReadyMessageOperatingHours(
  pickupDate: string,
  snapshot: OperatingHoursSnapshot,
): CollectionReadyMessageOperatingHours {
  const whitebird = resolveOperatingHours(snapshot, "whitebird", pickupDate);
  let whitebirdStatus: CollectionReadyMessageOperatingHours["whitebirdStatus"] =
    "unknown";

  if (whitebird.source !== "none") {
    if (!whitebird.enabled && hasNoTimes(whitebird)) {
      whitebirdStatus = "closed";
    } else if (isValidOpenHours(whitebird)) {
      whitebirdStatus = "open";
    }
  }

  const pickup = resolveOperatingHours(snapshot, "pickup", pickupDate);
  const pickupLatestBookable =
    pickup.source !== "none" &&
    pickup.enabled &&
    pickup.latestBookable &&
    hmToMinutes(pickup.latestBookable) !== null
      ? pickup.latestBookable
      : null;

  return { whitebirdStatus, pickupLatestBookable };
}
