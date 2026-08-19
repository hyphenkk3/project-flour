/**
 * Whole Cake customer fulfilment availability for a selected date.
 * Composes existing pickup, dine-in, and delivery calendars — no second calendar.
 */

import { getDeliverySchedule } from "@/engines/business-calendar/delivery-hours";
import { getDineInSchedule } from "@/engines/business-calendar/dine-in-hours";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import {
  customerHoursNoticeFromSnapshot,
  type OperatingHoursSnapshot,
} from "@/engines/business-calendar/operating-hours";
import {
  customerPickupSlotsForDate,
  isPickupOrdersClosed,
} from "@/engines/business-calendar/order-availability";
import type { CustomerWebsiteFulfilmentMethod } from "@/engines/orders/fulfilment";

export type CustomerFulfilmentAvailability = {
  available: boolean;
  reason: string | null;
};

export const CUSTOMER_FULFILMENT_HOURS_NOTICE =
  customerHoursNoticeFromSnapshot(OPERATING_HOURS_SEED);

export function customerFulfilmentHoursNotice(
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): string {
  return customerHoursNoticeFromSnapshot(snapshot);
}

export const DINE_IN_RESERVATION_INCLUDED_NOTICE =
  "Dine-in reservation included — your reservation is made together with your cake order. No separate reservation is required.";

export function customerPickupAvailability(
  dateYmd: string,
  closedDates: readonly string[],
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): CustomerFulfilmentAvailability {
  if (!dateYmd) return { available: false, reason: null };
  if (isPickupOrdersClosed(dateYmd, closedDates)) {
    return { available: false, reason: "Orders closed" };
  }
  if (customerPickupSlotsForDate(dateYmd, closedDates, snapshot).length === 0) {
    return { available: false, reason: "Unavailable" };
  }
  return { available: true, reason: null };
}

export function customerDineInAvailability(
  dateYmd: string,
  closedDates: readonly string[],
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): CustomerFulfilmentAvailability {
  if (!dateYmd) return { available: false, reason: null };
  if (isPickupOrdersClosed(dateYmd, closedDates)) {
    return { available: false, reason: "Orders closed" };
  }
  const schedule = getDineInSchedule(dateYmd, snapshot);
  if (schedule.status === "closed") {
    if (schedule.reason === "wednesday") {
      return { available: false, reason: "Unavailable Wednesday" };
    }
    return { available: false, reason: "Unavailable" };
  }
  return { available: true, reason: null };
}

export function customerDeliveryAvailability(
  dateYmd: string,
  closedDates: readonly string[],
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): CustomerFulfilmentAvailability {
  if (!dateYmd) return { available: false, reason: null };
  if (isPickupOrdersClosed(dateYmd, closedDates)) {
    return { available: false, reason: "Orders closed" };
  }
  const schedule = getDeliverySchedule(dateYmd, snapshot);
  if (schedule.status === "closed") {
    if (schedule.reason === "wednesday") {
      return { available: false, reason: "No delivery Wednesday" };
    }
    return { available: false, reason: "Unavailable" };
  }
  return { available: true, reason: null };
}

export function customerFulfilmentAvailability(
  dateYmd: string,
  closedDates: readonly string[],
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): Record<CustomerWebsiteFulfilmentMethod, CustomerFulfilmentAvailability> {
  return {
    pickup: customerPickupAvailability(dateYmd, closedDates, snapshot),
    dine_in: customerDineInAvailability(dateYmd, closedDates, snapshot),
    delivery: customerDeliveryAvailability(dateYmd, closedDates, snapshot),
  };
}

export function firstAvailableCustomerFulfilment(
  dateYmd: string,
  closedDates: readonly string[],
  preferred: CustomerWebsiteFulfilmentMethod,
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): CustomerWebsiteFulfilmentMethod {
  const availability = customerFulfilmentAvailability(
    dateYmd,
    closedDates,
    snapshot,
  );
  if (availability[preferred].available) return preferred;
  if (availability.pickup.available) return "pickup";
  if (availability.dine_in.available) return "dine_in";
  if (availability.delivery.available) return "delivery";
  return "pickup";
}
