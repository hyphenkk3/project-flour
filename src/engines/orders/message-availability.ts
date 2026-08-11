import {
  deriveOperationalState,
  type OperationalTimestamps,
} from "@/engines/orders/operational-state";
import {
  isPickupCrewMessageAvailable,
} from "@/engines/orders/fulfilment";
import type { MessageType } from "@/engines/orders/messages";
import type { StorefrontOrderFulfilmentMethod } from "@/types/storefront";

export type MessageAction = {
  type: MessageType;
  title: string;
  /**
   * Operationally most relevant action for the current Collection state.
   * Within a recipient group, primary actions render first and with stronger
   * emphasis; secondary remain available but quieter.
   */
  primary: boolean;
};

export type MessageAvailabilityInput = OperationalTimestamps & {
  /**
   * Delivery orders suppress Pickup Crew (M4-P4 owns Delivery Crew body).
   * Missing/unknown → treat as Pickup-available (historical safety).
   */
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod | null;
};

/**
 * Message availability by Collection operational state (Preview 3B).
 * Display groups: INTERNAL · CREW, then CUSTOMER.
 * Within CUSTOMER, primary action first (Ready when ready; Thank You when picked up).
 * Membership only changes by state; unavailable types are omitted.
 * Delivery: Pickup Crew action omitted (shared gate — see generateCrewOrderMessage).
 */
export function messageActionsForOperationalState(
  input: MessageAvailabilityInput,
): MessageAction[] {
  const state = deriveOperationalState(input);
  const crewAvailable = isPickupCrewMessageAvailable(input.fulfilmentMethod);

  switch (state) {
    case "not_ready":
      return crewAvailable
        ? [
            {
              type: "crew",
              title: "Crew Order Message",
              primary: true,
            },
          ]
        : [];
    case "ready":
      return [
        ...(crewAvailable
          ? [
              {
                type: "crew" as const,
                title: "Crew Order Message",
                primary: false,
              },
            ]
          : []),
        {
          type: "customer_ready",
          title: "Customer Ready Message",
          primary: true,
        },
      ];
    case "picked_up":
      return [
        ...(crewAvailable
          ? [
              {
                type: "crew" as const,
                title: "Crew Order Message",
                primary: false,
              },
            ]
          : []),
        {
          type: "customer_thank_you",
          title: "Customer Thank You Message",
          primary: true,
        },
        {
          type: "customer_ready",
          title: "Customer Ready Message",
          primary: false,
        },
      ];
  }
}

export function messageRecipientLabel(type: MessageType): string {
  return type === "crew" ? "INTERNAL · CREW" : "CUSTOMER";
}
