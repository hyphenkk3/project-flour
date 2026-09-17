/**
 * Fresh Picks customer fulfilment availability.
 * Composes Extra stock window + operating hours + same-day preparation overlay.
 */

import { getDeliverySlotsForDate } from "@/engines/business-calendar/delivery-hours";
import {
  getDineInSchedule,
  getDineInSlotsForDate,
} from "@/engines/business-calendar/dine-in-hours";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import { formatPickupClockLabel } from "@/engines/business-calendar/pickup-schedule";
import type { PickupSlot } from "@/engines/business-calendar/pickup-slots";
import {
  extraCustomerPickupSlotsForDate,
  extraPickupDates,
  type ExtraPickupWindow,
} from "@/engines/extra/extra-pickup";
import {
  DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
  freshPicksFulfilmentInstantMs,
  isFreshPicksFulfilmentDateToday,
  isFreshPicksSameDayCutoffPassed,
  sameDayFreshPicksCutoffCustomerMessage,
  slotPassesFreshPicksLead,
  type FreshPicksPreparationConfig,
} from "@/engines/extra/fresh-picks-preparation";
import { addBusinessCalendarDays, toBusinessDateKey } from "@/lib/dates";
import type { CustomerWebsiteFulfilmentMethod } from "@/engines/orders/fulfilment";

export type FreshPicksFulfilmentReasonCode =
  | "same_day_preparation_cutoff"
  | "preparation_lead_time"
  | "fulfilment_window_passed"
  | "no_available_slots"
  | "method_unavailable_for_date";

export type FreshPicksMethodAvailability = {
  method: CustomerWebsiteFulfilmentMethod;
  available: boolean;
  slots: PickupSlot[];
  reasonCode: FreshPicksFulfilmentReasonCode | null;
  message: string | null;
  /** When available, optional earliest remaining slot copy. */
  availableFromLabel: string | null;
};

export type FreshPicksDateAvailability = Record<
  CustomerWebsiteFulfilmentMethod,
  FreshPicksMethodAvailability
>;

const METHODS: CustomerWebsiteFulfilmentMethod[] = [
  "pickup",
  "dine_in",
  "delivery",
];

export type FreshPicksFulfilmentContext = {
  window: ExtraPickupWindow;
  now?: Date;
  snapshot?: OperatingHoursSnapshot;
  config?: FreshPicksPreparationConfig;
};

function contextDefaults(input: FreshPicksFulfilmentContext): {
  window: ExtraPickupWindow;
  now: Date;
  snapshot: OperatingHoursSnapshot;
  config: FreshPicksPreparationConfig;
} {
  return {
    window: input.window,
    now: input.now ?? new Date(),
    snapshot: input.snapshot ?? OPERATING_HOURS_SEED,
    config: input.config ?? DEFAULT_FRESH_PICKS_PREPARATION_CONFIG,
  };
}

function methodNoun(method: CustomerWebsiteFulfilmentMethod): string {
  if (method === "dine_in") return "dine-in";
  if (method === "delivery") return "delivery";
  return "pickup";
}

function operatingSlotsForMethod(
  method: CustomerWebsiteFulfilmentMethod,
  dateYmd: string,
  snapshot: OperatingHoursSnapshot,
): PickupSlot[] {
  if (method === "dine_in") return getDineInSlotsForDate(dateYmd, snapshot);
  if (method === "delivery") return getDeliverySlotsForDate(dateYmd, snapshot);
  return [];
}

function filterSlotsFromExtraStart(
  dateYmd: string,
  slots: PickupSlot[],
  window: ExtraPickupWindow,
): PickupSlot[] {
  const fromMs = Date.parse(window.pickupAvailableFromAt);
  if (!Number.isFinite(fromMs)) return [];
  return slots.filter((slot) => {
    const ms = freshPicksFulfilmentInstantMs(dateYmd, slot.value);
    return ms != null && ms >= fromMs;
  });
}

function filterSlotsByLead(
  method: CustomerWebsiteFulfilmentMethod,
  dateYmd: string,
  slots: PickupSlot[],
  now: Date,
  config: FreshPicksPreparationConfig,
): PickupSlot[] {
  const comparison = method === "dine_in" ? "strict" : "inclusive";
  return slots.filter((slot) =>
    slotPassesFreshPicksLead({
      dateYmd,
      timeHm: slot.value,
      now,
      config,
      comparison,
    }),
  );
}

function futureOperatingSlots(
  dateYmd: string,
  slots: PickupSlot[],
  now: Date,
): PickupSlot[] {
  const nowMs = now.getTime();
  return slots.filter((slot) => {
    const ms = freshPicksFulfilmentInstantMs(dateYmd, slot.value);
    return ms != null && ms > nowMs;
  });
}

function unavailable(
  method: CustomerWebsiteFulfilmentMethod,
  reasonCode: FreshPicksFulfilmentReasonCode,
  message: string,
): FreshPicksMethodAvailability {
  return {
    method,
    available: false,
    slots: [],
    reasonCode,
    message,
    availableFromLabel: null,
  };
}

function available(
  method: CustomerWebsiteFulfilmentMethod,
  slots: PickupSlot[],
): FreshPicksMethodAvailability {
  const first = slots[0]?.label ?? null;
  return {
    method,
    available: slots.length > 0,
    slots,
    reasonCode: null,
    message: null,
    availableFromLabel: first ? `Available from ${first}` : null,
  };
}

function methodClosedReason(
  method: CustomerWebsiteFulfilmentMethod,
  dateYmd: string,
  snapshot: OperatingHoursSnapshot,
): FreshPicksMethodAvailability {
  if (method === "delivery") {
    return unavailable(
      method,
      "method_unavailable_for_date",
      "Delivery is unavailable on this day.",
    );
  }
  if (method === "dine_in") {
    const schedule = getDineInSchedule(dateYmd, snapshot);
    if (schedule.status === "closed" && schedule.reason === "wednesday") {
      return unavailable(
        method,
        "method_unavailable_for_date",
        "Dine-in is unavailable on this day.",
      );
    }
    return unavailable(
      method,
      "method_unavailable_for_date",
      "Dine-in is unavailable on this day.",
    );
  }
  return unavailable(
    method,
    "method_unavailable_for_date",
    "Pickup is unavailable on this day.",
  );
}

function windowPassedMessage(method: CustomerWebsiteFulfilmentMethod): string {
  if (method === "delivery") {
    return "Today's delivery window has ended. Please select another date.";
  }
  if (method === "dine_in") {
    return "Today's dine-in reservation window has ended. Please select another date.";
  }
  return "No pickup times are available today.";
}

export function freshPicksMethodAvailability(
  method: CustomerWebsiteFulfilmentMethod,
  dateYmd: string,
  input: FreshPicksFulfilmentContext,
): FreshPicksMethodAvailability {
  const { window, now, snapshot, config } = contextDefaults(input);
  const key = dateYmd.trim().slice(0, 10);
  if (!extraPickupDates(window).includes(key)) {
    return unavailable(
      method,
      "no_available_slots",
      `No ${methodNoun(method)} times are available on this day.`,
    );
  }

  const operating =
    method === "pickup"
      ? extraCustomerPickupSlotsForDate(key, window, now, snapshot, config, {
          applySameDayPreparation: false,
        })
      : operatingSlotsForMethod(method, key, snapshot);

  if (operating.length === 0) {
    return methodClosedReason(method, key, snapshot);
  }

  const fromFiltered =
    method === "pickup"
      ? operating
      : filterSlotsFromExtraStart(key, operating, window);
  const isToday = isFreshPicksFulfilmentDateToday(key, now);
  const remainingOperating = isToday
    ? futureOperatingSlots(key, fromFiltered, now)
    : fromFiltered;

  if (isToday && remainingOperating.length === 0) {
    return unavailable(
      method,
      method === "pickup" ? "no_available_slots" : "fulfilment_window_passed",
      windowPassedMessage(method),
    );
  }

  if (isToday && isFreshPicksSameDayCutoffPassed(now, config)) {
    return unavailable(
      method,
      "same_day_preparation_cutoff",
      sameDayFreshPicksCutoffCustomerMessage(config),
    );
  }

  const slots =
    method === "pickup"
      ? extraCustomerPickupSlotsForDate(key, window, now, snapshot, config)
      : filterSlotsByLead(method, key, fromFiltered, now, config);

  if (slots.length > 0) return available(method, slots);

  if (isToday) {
    return unavailable(
      method,
      "preparation_lead_time",
      "No suitable fulfilment time is available yet for today.",
    );
  }

  return unavailable(
    method,
    "no_available_slots",
    `No ${methodNoun(method)} times are available on this day.`,
  );
}

export function freshPicksDateAvailability(
  dateYmd: string,
  input: FreshPicksFulfilmentContext,
): FreshPicksDateAvailability {
  return {
    pickup: freshPicksMethodAvailability("pickup", dateYmd, input),
    dine_in: freshPicksMethodAvailability("dine_in", dateYmd, input),
    delivery: freshPicksMethodAvailability("delivery", dateYmd, input),
  };
}

export function extraDateHasAnyFulfilmentSlot(
  dateYmd: string,
  input: FreshPicksFulfilmentContext,
): boolean {
  return METHODS.some(
    (method) => freshPicksMethodAvailability(method, dateYmd, input).available,
  );
}

export function extraCustomerVisibleFulfilmentDates(
  input: FreshPicksFulfilmentContext,
): string[] {
  const { window, now } = contextDefaults(input);
  const todayYmd = toBusinessDateKey(now);
  const upcoming = extraPickupDates(window).filter(
    (ymd) => ymd >= todayYmd && extraDateHasAnyFulfilmentSlot(ymd, input),
  );
  if (upcoming.length === 0) return [];
  const first = upcoming[0]!;
  if (first > todayYmd) return [first];
  return upcoming.slice(0, 2);
}

/**
 * When today is in the Extra window but no same-day method remains,
 * return the customer-facing reason. Prefers the preparation cutoff
 * when that is what removed today.
 */
export function extraCustomerSameDayUnavailableNotice(
  input: FreshPicksFulfilmentContext,
): string | null {
  const { window, now } = contextDefaults(input);
  const todayYmd = toBusinessDateKey(now);
  if (!extraPickupDates(window).includes(todayYmd)) return null;
  if (extraDateHasAnyFulfilmentSlot(todayYmd, input)) return null;
  const availability = freshPicksDateAvailability(todayYmd, input);
  const methods = [
    availability.pickup,
    availability.dine_in,
    availability.delivery,
  ];
  const cutoff = methods.find(
    (method) => method.reasonCode === "same_day_preparation_cutoff",
  );
  if (cutoff?.message) return cutoff.message;
  return methods.find((method) => method.message)?.message ?? null;
}

export function extraActionableFulfilmentDays(input: {
  pickupAvailableFromAt: string | null;
  orderCutoffAt: string | null;
  todayYmd: string;
  now?: Date;
  snapshot?: OperatingHoursSnapshot;
  config?: FreshPicksPreparationConfig;
}): Array<"today" | "tomorrow"> {
  if (!input.pickupAvailableFromAt || !input.orderCutoffAt) return [];
  const ctx: FreshPicksFulfilmentContext = {
    window: {
      pickupAvailableFromAt: input.pickupAvailableFromAt,
      orderCutoffAt: input.orderCutoffAt,
    },
    now: input.now,
    snapshot: input.snapshot,
    config: input.config,
  };
  const today = input.todayYmd.trim().slice(0, 10);
  const days: Array<"today" | "tomorrow"> = [];
  if (extraDateHasAnyFulfilmentSlot(today, ctx)) days.push("today");
  const tomorrow = addBusinessCalendarDays(today, 1);
  if (tomorrow && extraDateHasAnyFulfilmentSlot(tomorrow, ctx)) {
    days.push("tomorrow");
  }
  return days;
}

export function firstAvailableFreshPicksFulfilment(
  dateYmd: string,
  preferred: CustomerWebsiteFulfilmentMethod,
  input: FreshPicksFulfilmentContext,
): CustomerWebsiteFulfilmentMethod {
  const availability = freshPicksDateAvailability(dateYmd, input);
  if (availability[preferred].available) return preferred;
  if (availability.pickup.available) return "pickup";
  if (availability.dine_in.available) return "dine_in";
  if (availability.delivery.available) return "delivery";
  return preferred;
}

export function isValidExtraCustomerFulfilment(input: {
  method: CustomerWebsiteFulfilmentMethod;
  fulfilmentDate: string;
  fulfilmentTime: string;
  pickupAvailableFromAt: string;
  orderCutoffAt: string;
  now?: Date;
  snapshot?: OperatingHoursSnapshot;
  config?: FreshPicksPreparationConfig;
}): boolean {
  const ctx: FreshPicksFulfilmentContext = {
    window: {
      pickupAvailableFromAt: input.pickupAvailableFromAt,
      orderCutoffAt: input.orderCutoffAt,
    },
    now: input.now,
    snapshot: input.snapshot,
    config: input.config,
  };
  if (
    !extraCustomerVisibleFulfilmentDates(ctx).includes(input.fulfilmentDate)
  ) {
    return false;
  }
  const availability = freshPicksMethodAvailability(
    input.method,
    input.fulfilmentDate,
    ctx,
  );
  const time = input.fulfilmentTime.trim().slice(0, 5);
  return availability.slots.some((slot) => slot.value === time);
}

export function freshPicksChooserStates(
  dateYmd: string,
  input: FreshPicksFulfilmentContext,
): Record<
  CustomerWebsiteFulfilmentMethod,
  { available: boolean; reason: string | null; detail: string | null }
> {
  const availability = freshPicksDateAvailability(dateYmd, input);
  const map = {} as Record<
    CustomerWebsiteFulfilmentMethod,
    { available: boolean; reason: string | null; detail: string | null }
  >;
  for (const method of METHODS) {
    const state = availability[method];
    map[method] = {
      available: state.available,
      reason: state.available ? null : state.message,
      detail: state.available ? state.availableFromLabel : null,
    };
  }
  return map;
}

export { formatPickupClockLabel };
