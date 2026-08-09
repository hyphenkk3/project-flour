import {
  deriveOperationalState,
  type OperationalTimestamps,
} from "@/engines/orders/operational-state";
import type { MessageType } from "@/engines/orders/messages";

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

/**
 * Message availability by Collection operational state (Preview 3B).
 * Display groups: INTERNAL · CREW, then CUSTOMER.
 * Within CUSTOMER, primary action first (Ready when ready; Thank You when picked up).
 * Membership only changes by state; unavailable types are omitted.
 */
export function messageActionsForOperationalState(
  input: OperationalTimestamps,
): MessageAction[] {
  const state = deriveOperationalState(input);

  switch (state) {
    case "not_ready":
      return [
        {
          type: "crew",
          title: "Crew Order Message",
          primary: true,
        },
      ];
    case "ready":
      return [
        {
          type: "crew",
          title: "Crew Order Message",
          primary: false,
        },
        {
          type: "customer_ready",
          title: "Customer Ready Message",
          primary: true,
        },
      ];
    case "picked_up":
      return [
        {
          type: "crew",
          title: "Crew Order Message",
          primary: false,
        },
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
