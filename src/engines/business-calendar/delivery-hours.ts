/**
 * Whole Cake customer Delivery windows — resolved from operating hours.
 */

import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import {
  resolveOperatingHours,
  slotsWithinHours,
  weekdayFromYmd,
  type OperatingHoursSnapshot,
} from "@/engines/business-calendar/operating-hours";
import { formatPickupClockLabel } from "@/engines/business-calendar/pickup-schedule";
import { earliestPickupDateYmd } from "@/engines/business-calendar/pickup-slots";
import type { PickupSlot } from "@/engines/business-calendar/pickup-slots";

export type DeliverySchedule =
  | { status: "open"; earliest: string; latest: string; slots: PickupSlot[] }
  | { status: "closed"; reason: "invalid_date" | "wednesday" | "override_closed" };

function toSlots(times: string[]): PickupSlot[] {
  return times.map((value) => ({
    value,
    label: formatPickupClockLabel(value),
  }));
}

export function getDeliverySchedule(
  dateYmd: string,
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): DeliverySchedule {
  const weekday = weekdayFromYmd(dateYmd);
  if (weekday == null) {
    return { status: "closed", reason: "invalid_date" };
  }
  const row = resolveOperatingHours(snapshot, "delivery", dateYmd);
  const times = slotsWithinHours(row);
  if (times.length === 0) {
    return {
      status: "closed",
      reason: weekday === 3 && row.source !== "override" ? "wednesday" : "override_closed",
    };
  }
  return {
    status: "open",
    earliest: times[0] ?? row.opensAt ?? "12:00",
    latest: times[times.length - 1] ?? row.latestBookable ?? "15:00",
    slots: toSlots(times),
  };
}

export function getDeliverySlotsForDate(
  dateYmd: string,
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): PickupSlot[] {
  const schedule = getDeliverySchedule(dateYmd, snapshot);
  return schedule.status === "open" ? schedule.slots : [];
}

export function isValidDeliverySlot(
  dateYmd: string,
  timeValue: string,
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
): boolean {
  const normalized = timeValue.trim().slice(0, 5);
  return getDeliverySlotsForDate(dateYmd, snapshot).some(
    (slot) => slot.value === normalized,
  );
}

export function isDeliveryDateSelectable(
  dateYmd: string,
  earliestYmd: string = earliestPickupDateYmd(),
): boolean {
  if (dateYmd < earliestYmd) return false;
  return getDeliverySchedule(dateYmd).status === "open";
}
