import {
  deriveOperationalState,
  type OperationalTimestamps,
} from "@/engines/orders/operational-state";
import {
  isCrewOrderMessageAvailable,
  isDeliveryRecipientSameAsOrderingCustomer,
} from "@/engines/orders/fulfilment";
import {
  outForDeliveryContactForAudience,
  outForDeliveryMessageAudiences,
  type MessageType,
  type OutForDeliveryAudience,
} from "@/engines/orders/messages";
import type { StorefrontOrder, StorefrontOrderFulfilmentMethod } from "@/types/storefront";

export type MessageAction = {
  type: MessageType;
  title: string;
  /**
   * Operationally most relevant action for the current Collection state.
   * Within a recipient group, primary actions render first and with stronger
   * emphasis; secondary remain available but quieter.
   */
  primary: boolean;
  /** Out for Delivery INFORM: distinct copy target. */
  audience?: OutForDeliveryAudience;
  contactName?: string;
  contactPhone?: string;
};

export type MessageAvailabilityInput = OperationalTimestamps & {
  /**
   * Fulfilment selects Pickup vs Delivery Crew body (M4-P4).
   * Missing/unknown → Pickup formatter (historical safety).
   */
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod | null;
  order?: Pick<
    StorefrontOrder,
    "customerName" | "phone" | "fulfilmentMethod" | "delivery"
  >;
};

/**
 * Message availability by operational state (Preview 3B + M4-P5).
 * Display groups: INTERNAL · CREW, then CUSTOMER.
 * Pickup Ready is never used for Delivery.
 */
export function isCustomerReadyMessageAvailable(
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod | null,
): boolean {
  return fulfilmentMethod !== "delivery";
}

export function isDeliveryCustomerReadyMessageAvailable(
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod | null,
): boolean {
  return fulfilmentMethod === "delivery";
}

function crewAction(primary: boolean): MessageAction {
  return {
    type: "crew",
    title: "Crew Order Message",
    primary,
  };
}

function pickupReadyAction(primary: boolean): MessageAction {
  return {
    type: "customer_ready",
    title: "Customer Ready Message",
    primary,
  };
}

function deliveryReadyAction(primary: boolean): MessageAction {
  return {
    type: "customer_delivery_ready",
    title: "Delivery Customer Ready",
    primary,
  };
}

function thankYouAction(primary: boolean): MessageAction {
  return {
    type: "customer_thank_you",
    title: "Customer Thank You Message",
    primary,
  };
}

function outForDeliveryTitle(
  order:
    | Pick<StorefrontOrder, "customerName" | "phone" | "fulfilmentMethod" | "delivery">
    | undefined,
  audience: OutForDeliveryAudience,
  informBoth: boolean,
): string {
  if (informBoth) {
    return audience === "recipient"
      ? "Out for Delivery — Recipient"
      : "Out for Delivery — Person who ordered";
  }
  if (
    order?.delivery &&
    !isDeliveryRecipientSameAsOrderingCustomer({
      customerName: order.customerName,
      customerPhone: order.phone,
      delivery: order.delivery,
    })
  ) {
    return "Out for Delivery — Person who ordered";
  }
  return "Out for Delivery Message";
}

function outForDeliveryActions(
  input: MessageAvailabilityInput,
  primary: boolean,
): MessageAction[] {
  const audiences = input.order
    ? outForDeliveryMessageAudiences(input.order)
    : (["orderer"] as OutForDeliveryAudience[]);
  const informBoth = audiences.includes("recipient");

  return audiences.map((audience, index) => {
    const contact = input.order
      ? outForDeliveryContactForAudience(input.order, audience)
      : null;
    return {
      type: "customer_out_for_delivery" as const,
      title: outForDeliveryTitle(input.order, audience, informBoth),
      primary: Boolean(primary && (index === 0 || informBoth)),
      audience,
      contactName: contact?.name,
      contactPhone: contact?.phone,
    };
  });
}

export function messageActionsForOperationalState(
  input: MessageAvailabilityInput,
): MessageAction[] {
  const state = deriveOperationalState(input);
  const crewAvailable = isCrewOrderMessageAvailable(input.fulfilmentMethod);
  const pickupReadyAvailable = isCustomerReadyMessageAvailable(
    input.fulfilmentMethod,
  );
  const deliveryReadyAvailable = isDeliveryCustomerReadyMessageAvailable(
    input.fulfilmentMethod,
  );

  switch (state) {
    case "not_ready":
      return crewAvailable ? [crewAction(true)] : [];
    case "ready":
      return [
        ...(crewAvailable
          ? [crewAction(!(pickupReadyAvailable || deliveryReadyAvailable))]
          : []),
        ...(pickupReadyAvailable ? [pickupReadyAction(true)] : []),
        ...(deliveryReadyAvailable ? [deliveryReadyAction(true)] : []),
      ];
    case "out_for_delivery":
      return [
        ...(crewAvailable ? [crewAction(false)] : []),
        ...outForDeliveryActions(input, true),
        thankYouAction(false),
        ...(deliveryReadyAvailable ? [deliveryReadyAction(false)] : []),
      ];
    case "delivered":
      return [
        ...(crewAvailable ? [crewAction(false)] : []),
        thankYouAction(true),
        ...(deliveryReadyAvailable ? [deliveryReadyAction(false)] : []),
        ...outForDeliveryActions(input, false),
      ];
    case "picked_up":
      return [
        ...(crewAvailable ? [crewAction(false)] : []),
        thankYouAction(true),
        ...(pickupReadyAvailable ? [pickupReadyAction(false)] : []),
      ];
  }
}

export function messageRecipientLabel(
  type: MessageType,
  audience?: OutForDeliveryAudience,
): string {
  if (type === "crew") return "INTERNAL · CREW";
  if (type === "customer_delivery_ready") return "CUSTOMER · PERSON WHO ORDERED";
  if (type === "customer_out_for_delivery") {
    if (audience === "recipient") return "CUSTOMER · RECIPIENT";
    if (audience === "orderer") return "CUSTOMER · PERSON WHO ORDERED";
  }
  return "CUSTOMER";
}
