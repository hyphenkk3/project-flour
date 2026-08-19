/**
 * Whole Cake dine-in booking and venue availability.
 * Hours come from the persisted operating-hours snapshot (seed until DB is applied).
 * Venue list is derived from dine-in booking hours ∩ outlet hours at that date/time.
 */

import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import {
  hmToMinutes,
  isTimeWithinHours,
  resolveOperatingHours,
  slotsWithinHours,
  weekdayFromYmd,
  type OperatingHoursSnapshot,
} from "@/engines/business-calendar/operating-hours";
import { formatPickupClockLabel } from "@/engines/business-calendar/pickup-schedule";
import { earliestPickupDateYmd } from "@/engines/business-calendar/pickup-slots";
import type { PickupSlot } from "@/engines/business-calendar/pickup-slots";

export const DINE_IN_VENUES = ["hyphen", "whitebird"] as const;
export type DineInVenue = (typeof DINE_IN_VENUES)[number];

/** Cake serving may be the reservation start, or up to 60 minutes later. */
export const DINE_IN_CAKE_SERVING_WINDOW_MINUTES = 60;

export type DineInSchedule =
  | { status: "open"; earliest: string; latest: string; slots: PickupSlot[] }
  | { status: "closed"; reason: "invalid_date" | "wednesday" | "override_closed" };

function defaultSnapshot(
  snapshot?: OperatingHoursSnapshot,
): OperatingHoursSnapshot {
  return snapshot ?? OPERATING_HOURS_SEED;
}

function toSlots(times: string[]): PickupSlot[] {
  return times.map((value) => ({
    value,
    label: formatPickupClockLabel(value),
  }));
}

export function parseDineInVenue(value: unknown): DineInVenue | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "hyphen" || raw === "whitebird") return raw;
  return null;
}

export function dineInVenueLabel(venue: DineInVenue): "Hyphen" | "Whitebird" {
  return venue === "hyphen" ? "Hyphen" : "Whitebird";
}

export function availableDineInVenues(
  dateYmd: string,
  timeValue: string,
  snapshot?: OperatingHoursSnapshot,
): DineInVenue[] {
  const hours = defaultSnapshot(snapshot);
  const time = timeValue.trim().slice(0, 5);
  const dineIn = resolveOperatingHours(hours, "dine_in", dateYmd);
  if (!isTimeWithinHours(dineIn, time)) return [];
  return DINE_IN_VENUES.filter((venue) =>
    isTimeWithinHours(resolveOperatingHours(hours, venue, dateYmd), time),
  );
}

export function isDineInVenueAvailable(
  dateYmd: string,
  timeValue: string,
  venue: DineInVenue,
  snapshot?: OperatingHoursSnapshot,
): boolean {
  return availableDineInVenues(dateYmd, timeValue, snapshot).includes(venue);
}

export function resolveDineInSchedule(
  dateYmd: string,
  snapshot?: OperatingHoursSnapshot,
): DineInSchedule {
  const weekday = weekdayFromYmd(dateYmd);
  if (weekday == null) {
    return { status: "closed", reason: "invalid_date" };
  }
  const hours = defaultSnapshot(snapshot);
  const dineIn = resolveOperatingHours(hours, "dine_in", dateYmd);
  const openTimes = slotsWithinHours(dineIn).filter(
    (slot) => availableDineInVenues(dateYmd, slot, hours).length > 0,
  );
  if (openTimes.length === 0) {
    return {
      status: "closed",
      reason:
        weekday === 3 && dineIn.source !== "override"
          ? "wednesday"
          : "override_closed",
    };
  }
  return {
    status: "open",
    earliest: openTimes[0] ?? dineIn.opensAt ?? "12:00",
    latest: openTimes[openTimes.length - 1] ?? dineIn.latestBookable ?? "17:00",
    slots: toSlots(openTimes),
  };
}

export function getDineInSchedule(
  dateYmd: string,
  snapshot?: OperatingHoursSnapshot,
): DineInSchedule {
  return resolveDineInSchedule(dateYmd, snapshot);
}

export function getDineInSlotsForDate(
  dateYmd: string,
  snapshot?: OperatingHoursSnapshot,
): PickupSlot[] {
  const schedule = getDineInSchedule(dateYmd, snapshot);
  return schedule.status === "open" ? schedule.slots : [];
}

export function isValidDineInSlot(
  dateYmd: string,
  timeValue: string,
  snapshot?: OperatingHoursSnapshot,
): boolean {
  const normalized = timeValue.trim().slice(0, 5);
  return getDineInSlotsForDate(dateYmd, snapshot).some(
    (slot) => slot.value === normalized,
  );
}

export function resolveDineInVenueSelection(
  dateYmd: string,
  timeValue: string,
  current: string | null | undefined,
  snapshot?: OperatingHoursSnapshot,
): DineInVenue | "" {
  const venues = availableDineInVenues(dateYmd, timeValue, snapshot);
  const parsed = parseDineInVenue(current);
  if (parsed && venues.includes(parsed)) return parsed;
  if (venues.length === 1) return venues[0] ?? "";
  return "";
}

export function isDineInDateSelectable(
  dateYmd: string,
  earliestYmd: string = earliestPickupDateYmd(),
  snapshot?: OperatingHoursSnapshot,
): boolean {
  if (dateYmd < earliestYmd) return false;
  return getDineInSchedule(dateYmd, snapshot).status === "open";
}

export function isCakeServingWithinReservationWindow(
  reservationHm: string,
  servingHm: string,
): boolean {
  const reservation = hmToMinutes(reservationHm.trim().slice(0, 5));
  const serving = hmToMinutes(servingHm.trim().slice(0, 5));
  if (reservation == null || serving == null) return false;
  return (
    serving >= reservation &&
    serving <= reservation + DINE_IN_CAKE_SERVING_WINDOW_MINUTES
  );
}

export function venuesForReservationAndServing(
  dateYmd: string,
  reservationHm: string,
  servingHm: string,
  snapshot?: OperatingHoursSnapshot,
): DineInVenue[] {
  const atReservation = availableDineInVenues(dateYmd, reservationHm, snapshot);
  if (atReservation.length === 0) return [];
  if (reservationHm.trim().slice(0, 5) === servingHm.trim().slice(0, 5)) {
    return atReservation;
  }
  const atServing = availableDineInVenues(dateYmd, servingHm, snapshot);
  return atReservation.filter((venue) => atServing.includes(venue));
}

export function cakeServingSlotsForReservation(
  dateYmd: string,
  reservationHm: string,
  snapshot?: OperatingHoursSnapshot,
): PickupSlot[] {
  const reservation = reservationHm.trim().slice(0, 5);
  if (!isValidDineInSlot(dateYmd, reservation, snapshot)) return [];
  return getDineInSlotsForDate(dateYmd, snapshot).filter((slot) => {
    if (!isCakeServingWithinReservationWindow(reservation, slot.value)) {
      return false;
    }
    return (
      venuesForReservationAndServing(
        dateYmd,
        reservation,
        slot.value,
        snapshot,
      ).length > 0
    );
  });
}

export function resolveDineInVenueForPair(
  dateYmd: string,
  reservationHm: string,
  servingHm: string,
  current: string | null | undefined,
  snapshot?: OperatingHoursSnapshot,
): DineInVenue | "" {
  const venues = venuesForReservationAndServing(
    dateYmd,
    reservationHm,
    servingHm,
    snapshot,
  );
  const parsed = parseDineInVenue(current);
  if (parsed && venues.includes(parsed)) return parsed;
  if (venues.length === 1) return venues[0] ?? "";
  return "";
}

export function isValidDineInReservationPair(input: {
  dateYmd: string;
  reservationTime: string;
  servingTime: string;
  venue: DineInVenue;
  snapshot?: OperatingHoursSnapshot;
}): boolean {
  const reservation = input.reservationTime.trim().slice(0, 5);
  const serving = input.servingTime.trim().slice(0, 5);
  if (!isValidDineInSlot(input.dateYmd, reservation, input.snapshot)) {
    return false;
  }
  if (!isValidDineInSlot(input.dateYmd, serving, input.snapshot)) {
    return false;
  }
  if (!isCakeServingWithinReservationWindow(reservation, serving)) {
    return false;
  }
  return venuesForReservationAndServing(
    input.dateYmd,
    reservation,
    serving,
    input.snapshot,
  ).includes(input.venue);
}

export function parseGuestCount(value: unknown): number | null {
  const n =
    typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 50) return null;
  return n;
}
