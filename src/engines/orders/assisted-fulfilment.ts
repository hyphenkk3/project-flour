/**
 * Customer Operations assisted-order fulfilment.
 * Reuses Whole Cake customer calendars and Owner delivery-detail validation.
 * Owner special-arrangement date/time is an explicit higher-authority exception.
 */

import { isValidDeliverySlot } from "@/engines/business-calendar/delivery-hours";
import {
  isValidDineInReservationPair,
  isValidDineInSlot,
  type DineInVenue,
} from "@/engines/business-calendar/dine-in-hours";
import {
  buildDineInReservationRpcPayload,
  validateDineInParty,
} from "@/engines/orders/dine-in-party";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  ORDERS_CLOSED_RPC_MESSAGE,
  isPickupOrdersClosed,
} from "@/engines/business-calendar/order-availability";
import {
  earliestPickupDateYmd,
  isValidClockPickupTime,
  isValidPickupSlot,
} from "@/engines/business-calendar/pickup-slots";
import { canOverrideCustomerFulfilmentSchedule } from "@/engines/orders/delivery-finance-capabilities";
import {
  buildCreateStaffFulfilmentRpcParams,
  parseCustomerWebsiteFulfilmentMethod,
  validateOwnerCreateFulfilment,
  type CustomerWebsiteFulfilmentMethod,
  type DeliveryCreateDraft,
  type DeliveryCreateRpcPayload,
} from "@/engines/orders/fulfilment";
import type { RoleCode } from "@/types/staff";

export const ASSISTED_ORDER_FULFILMENT_OPTIONS = [
  { value: "pickup" as const, label: "Pickup" },
  { value: "dine_in" as const, label: "Dine-in" },
  { value: "delivery" as const, label: "Delivery" },
];

export type AssistedDineInDraft = {
  reservationTime: string;
  venue: string;
  adultCount: string;
  kidCount: string;
  toddlerCount: string;
  guestCount: string;
  reservationNote: string;
};

export type AssistedDineInRpcPayload = {
  venue: DineInVenue;
  adult_count: number;
  kid_count: number;
  toddler_count: number;
  guest_count: number;
  reservation_time: string;
  reservation_note: string | null;
  whitebird_split_seating_acknowledged: boolean;
};

export function defaultAssistedDineInDraft(): AssistedDineInDraft {
  return {
    reservationTime: "",
    venue: "",
    adultCount: "",
    kidCount: "",
    toddlerCount: "",
    guestCount: "",
    reservationNote: "",
  };
}

export function buildAssistedDineInRpcPayload(
  draft: AssistedDineInDraft,
): AssistedDineInRpcPayload | null {
  const reservationTime = draft.reservationTime.trim().slice(0, 5);
  const party = validateDineInParty({
    venue: draft.venue,
    adultCount: draft.adultCount,
    kidCount: draft.kidCount,
    toddlerCount: draft.toddlerCount,
    guestCount: draft.guestCount,
    requireAcknowledgement: false,
  });
  if (!party.ok || !reservationTime) return null;
  return buildDineInReservationRpcPayload({
    party: party.party,
    reservationTime,
    reservationNote: draft.reservationNote.trim() || null,
  });
}

export function buildAssistedFulfilmentRpcParams(input: {
  method: CustomerWebsiteFulfilmentMethod;
  delivery: DeliveryCreateDraft;
  dineIn: AssistedDineInDraft;
}): {
  p_fulfilment_method: CustomerWebsiteFulfilmentMethod;
  p_delivery: DeliveryCreateRpcPayload | null;
  p_dine_in: AssistedDineInRpcPayload | null;
} {
  if (input.method === "dine_in") {
    return {
      p_fulfilment_method: "dine_in",
      p_delivery: null,
      p_dine_in: buildAssistedDineInRpcPayload(input.dineIn),
    };
  }
  if (input.method === "delivery") {
    const delivery = buildCreateStaffFulfilmentRpcParams({
      method: "delivery",
      delivery: input.delivery,
    });
    return {
      p_fulfilment_method: "delivery",
      p_delivery: delivery.p_delivery,
      p_dine_in: null,
    };
  }
  return {
    p_fulfilment_method: "pickup",
    p_delivery: null,
    p_dine_in: null,
  };
}

export function parseOwnerSpecialArrangementFlag(value: unknown): boolean {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

/**
 * Canonical customer slots unless the actor is Owner and explicitly opted
 * into a special-arrangement custom date/time.
 */
export function assistedCreateSlotPolicy(input: {
  actorRole: RoleCode;
  ownerSpecialArrangement: boolean;
}): "owner-clock" | "customer-slots" {
  if (
    canOverrideCustomerFulfilmentSchedule(input.actorRole) &&
    input.ownerSpecialArrangement
  ) {
    return "owner-clock";
  }
  return "customer-slots";
}

/**
 * Owner special arrangement: skip customer earliest/slot/cutoff checks.
 * Delivery details and dine-in reservation structure remain required.
 * Dine-in times must still be persistable on the existing reservation grid.
 */
export function validateAssistedOwnerOverrideFulfilment(input: {
  method: string | null | undefined;
  dateYmd: string;
  timeValue: string;
  delivery: DeliveryCreateDraft;
  dineIn: AssistedDineInDraft;
  hoursSnapshot?: OperatingHoursSnapshot;
}): string | null {
  const method = parseCustomerWebsiteFulfilmentMethod(input.method);
  const dateYmd = input.dateYmd.trim();
  const timeValue = input.timeValue.trim().slice(0, 5);
  const snapshot = input.hoursSnapshot ?? OPERATING_HOURS_SEED;

  if (!dateYmd || !timeValue) {
    if (method === "pickup") {
      return "Please choose a pickup date and time.";
    }
    if (method === "delivery") {
      return "Please choose a delivery date and time.";
    }
    return "Please choose a date and time.";
  }

  if (method === "pickup") {
    if (!isValidClockPickupTime(timeValue)) {
      return "Please enter a valid pickup clock time.";
    }
    return null;
  }

  if (method === "delivery") {
    if (!isValidClockPickupTime(timeValue)) {
      return "Please enter a valid delivery clock time.";
    }
    return validateOwnerCreateFulfilment({
      method: "delivery",
      pickupDate: dateYmd,
      pickupTime: timeValue,
      delivery: input.delivery,
    });
  }

  const reservationTime = input.dineIn.reservationTime.trim().slice(0, 5);
  if (!reservationTime || !isValidClockPickupTime(reservationTime)) {
    return "Please choose a dine-in reservation time.";
  }
  if (!isValidClockPickupTime(timeValue)) {
    return "Please choose a cake serving time.";
  }
  const party = validateDineInParty({
    venue: input.dineIn.venue,
    adultCount: input.dineIn.adultCount,
    kidCount: input.dineIn.kidCount,
    toddlerCount: input.dineIn.toddlerCount,
    guestCount: input.dineIn.guestCount,
    requireAcknowledgement: false,
  });
  if (!party.ok) return party.error;
  if (
    !isValidDineInReservationPair({
      dateYmd,
      reservationTime,
      servingTime: timeValue,
      venue: party.party.venue,
      snapshot,
    })
  ) {
    return "Cake serving time must be within 1 hour of the reservation time, and the venue must be available for both times.";
  }
  return null;
}

export function validateAssistedOrderFulfilment(input: {
  method: string | null | undefined;
  dateYmd: string;
  timeValue: string;
  delivery: DeliveryCreateDraft;
  dineIn: AssistedDineInDraft;
  closedDates?: readonly string[];
  hoursSnapshot?: OperatingHoursSnapshot;
  earliestYmd?: string;
}): string | null {
  const method = parseCustomerWebsiteFulfilmentMethod(input.method);
  const dateYmd = input.dateYmd.trim();
  const timeValue = input.timeValue.trim().slice(0, 5);
  const closedDates = input.closedDates ?? [];
  const snapshot = input.hoursSnapshot ?? OPERATING_HOURS_SEED;
  const earliest = input.earliestYmd ?? earliestPickupDateYmd();

  if (!dateYmd || !timeValue) {
    if (method === "pickup") {
      return "Please choose a pickup date and time.";
    }
    if (method === "delivery") {
      return "Please choose a delivery date and time.";
    }
    return "Please choose a date and time.";
  }

  if (dateYmd < earliest) {
    return "Please choose a valid date and time.";
  }

  if (isPickupOrdersClosed(dateYmd, closedDates)) {
    return ORDERS_CLOSED_RPC_MESSAGE;
  }

  if (method === "pickup") {
    if (!isValidPickupSlot(dateYmd, timeValue, snapshot)) {
      return "Please choose a valid pickup time for that date.";
    }
    return null;
  }

  if (method === "delivery") {
    if (!isValidDeliverySlot(dateYmd, timeValue, snapshot)) {
      return "Please choose a valid delivery time for that date.";
    }
    return validateOwnerCreateFulfilment({
      method: "delivery",
      pickupDate: dateYmd,
      pickupTime: timeValue,
      delivery: input.delivery,
    });
  }

  const reservationTime = input.dineIn.reservationTime.trim().slice(0, 5);
  if (
    !reservationTime ||
    !isValidDineInSlot(dateYmd, reservationTime, snapshot)
  ) {
    return "Please choose a valid dine-in reservation time for that date.";
  }
  if (!isValidDineInSlot(dateYmd, timeValue, snapshot)) {
    return "Please choose a valid cake serving time for that date.";
  }
  const party = validateDineInParty({
    venue: input.dineIn.venue,
    adultCount: input.dineIn.adultCount,
    kidCount: input.dineIn.kidCount,
    toddlerCount: input.dineIn.toddlerCount,
    guestCount: input.dineIn.guestCount,
    requireAcknowledgement: false,
  });
  if (!party.ok) return party.error;
  if (
    !isValidDineInReservationPair({
      dateYmd,
      reservationTime,
      servingTime: timeValue,
      venue: party.party.venue,
      snapshot,
    })
  ) {
    return "Cake serving time must be within 1 hour of the reservation time, and the venue must be available for both times.";
  }
  return null;
}
