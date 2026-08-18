/**
 * Fresh Picks Extra — 3 concepts, operating-hour slots, customer pickup vs cutoff.
 * Run: npx tsx scripts/test-extra-fresh-picks-eligibility.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isExtraAvailable } from "@/engines/extra/availability";
import { buildExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";
import {
  extraCustomerPickupSlotsForDate,
  extraOrderablePickupDates,
  extraPickupDates,
  isValidExtraCustomerPickup,
} from "@/engines/extra/extra-pickup";
import {
  extraActionableFreshPickDay,
  homepageFreshPicksCountCopy,
  homepageFreshPicksDescription,
  homepageFreshPicksHorizon,
  isPublishedFreshPick,
} from "@/engines/extra/customer-fresh-picks";
import {
  EXTRA_CUTOFF_NOT_OPERATING,
  EXTRA_CUTOFF_BEYOND_PICKUP_PLUS_ONE,
  EXTRA_FRESH_PICKS_TODAY_OR_TOMORROW,
  EXTRA_FROM_AFTER_CUTOFF,
  EXTRA_THROUGH_TIME_PAST,
  clampExtraOrderCutoffDate,
  defaultExtraOrderCutoffSlot,
  defaultExtraPickupFromSlot,
  evaluateExtraConfirm,
  extraOperatingSlotsForDate,
  extraOrderCutoffDateOptions,
  extraOrderCutoffSlotsForDate,
  extraPickupThroughIso,
  extraThroughSlotLabel,
  extraCustomerAvailabilityLabel,
  formatExtraBoardWindowInstant,
  formatExtraPickupThroughClock,
  isExtraThroughSlot,
  singaporeDateTimeToIso,
} from "@/engines/extra/fresh-picks-eligibility";
import { toBusinessDateKey } from "@/lib/dates";

const TODAY = "2026-08-17"; // Monday
const TOMORROW = "2026-08-18"; // Tuesday
const WEDNESDAY = "2026-08-19";
const THURSDAY = "2026-08-20";
const MID_MORNING = new Date("2026-08-17T02:15:00.000Z"); // 10:15 AM Malaysia time
const ONE_PM = new Date("2026-08-17T05:00:00.000Z"); // 1:00 PM Malaysia time
const AFTER_MONDAY_HOURS = new Date("2026-08-17T09:45:00.000Z"); // 5:45 PM Malaysia time, after 5:30 PM close

assert.equal(isExtraThroughSlot("12:00"), true);
assert.equal(isExtraThroughSlot("12:30"), true);
assert.equal(isExtraThroughSlot("10:15"), false);
assert.equal(extraThroughSlotLabel("14:00"), "2:00 PM");
assert.equal(
  extraPickupThroughIso(TODAY, "12:00"),
  "2026-08-17T04:00:00.000Z",
  "12:00 PM SG is 04:00 UTC",
);
assert.equal(
  singaporeDateTimeToIso(TODAY, "00:00"),
  "2026-08-16T16:00:00.000Z",
);

const mondaySlots = extraOperatingSlotsForDate(TODAY).map((s) => s.value);
assert.equal(mondaySlots[0], "12:00");
assert.equal(mondaySlots.at(-1), "17:30");
assert.equal(mondaySlots.includes("12:30"), true);
assert.equal(mondaySlots.includes("11:30"), false);
assert.equal(mondaySlots.includes("10:30"), false);
assert.equal(mondaySlots.includes("18:00"), false);
for (let i = 1; i < mondaySlots.length; i += 1) {
  const prev = mondaySlots[i - 1]!.split(":").map(Number);
  const next = mondaySlots[i]!.split(":").map(Number);
  const delta = next[0]! * 60 + next[1]! - (prev[0]! * 60 + prev[1]!);
  assert.equal(delta, 30, "operating slots are 30-minute intervals");
}

const wednesdaySlots = extraOperatingSlotsForDate(WEDNESDAY).map((s) => s.value);
assert.equal(wednesdaySlots[0], "12:00");
assert.equal(wednesdaySlots.at(-1), "15:00");
assert.equal(wednesdaySlots.includes("15:30"), false);
assert.equal(wednesdaySlots.includes("17:30"), false);

{
  const ok = evaluateExtraConfirm({
    pickupFromDate: TODAY,
    pickupFromSlot: "12:00",
    cutoffDate: TODAY,
    cutoffSlot: "17:30",
    todayYmd: TODAY,
    now: MID_MORNING,
  });
  assert.equal(ok.ok, true, "today operating from/through accepted");
  if (ok.ok) {
    assert.equal(ok.preparedOn, TODAY);
    assert.equal(ok.pickupAvailableFromIso, extraPickupThroughIso(TODAY, "12:00"));
    assert.equal(ok.orderCutoffIso, extraPickupThroughIso(TODAY, "17:30"));
    assert.equal(
      isExtraAvailable({
        lifecycle: "confirmed",
        pickupThroughAt: ok.orderCutoffIso,
        now: MID_MORNING,
      }),
      true,
    );
    assert.equal(
      isPublishedFreshPick({
        lifecycle: "confirmed",
        confirmedAt: MID_MORNING.toISOString(),
        pickupThroughAt: ok.orderCutoffIso,
        now: MID_MORNING,
      }),
      true,
      "confirmed Extra is visible immediately, before pickup-from",
    );
  }
}

{
  const laterPickup = evaluateExtraConfirm({
    pickupFromDate: TODAY,
    pickupFromSlot: "15:00",
    cutoffDate: TODAY,
    cutoffSlot: "17:30",
    todayYmd: TODAY,
    now: MID_MORNING,
  });
  assert.equal(laterPickup.ok, true, "pickup-from can be later than posting time");
  if (laterPickup.ok) {
    assert.ok(
      Date.parse(laterPickup.pickupAvailableFromIso) > MID_MORNING.getTime(),
    );
    assert.equal(
      isPublishedFreshPick({
        lifecycle: "confirmed",
        confirmedAt: MID_MORNING.toISOString(),
        pickupThroughAt: laterPickup.orderCutoffIso,
        now: MID_MORNING,
      }),
      true,
      "customer can see/order immediately even when pickup-from is later",
    );
  }
}

{
  const cross = evaluateExtraConfirm({
    pickupFromDate: TODAY,
    pickupFromSlot: "12:00",
    cutoffDate: TOMORROW,
    cutoffSlot: "14:00",
    todayYmd: TODAY,
    now: MID_MORNING,
  });
  assert.equal(cross.ok, true, "order window can cross calendar days");
  if (cross.ok) {
    assert.equal(cross.pickupFromDate, TODAY);
    assert.equal(cross.cutoffDate, TOMORROW);
    assert.equal(
      isPublishedFreshPick({
        lifecycle: "confirmed",
        pickupThroughAt: cross.orderCutoffIso,
        now: new Date("2026-08-17T16:30:00.000Z"),
      }),
      true,
      "still orderable after midnight before tomorrow cutoff",
    );
    const afterCutoff = new Date(Date.parse(cross.orderCutoffIso) + 1);
    assert.equal(
      isPublishedFreshPick({
        lifecycle: "confirmed",
        pickupThroughAt: cross.orderCutoffIso,
        now: afterCutoff,
      }),
      false,
      "order cutoff controls new-order availability",
    );
    assert.equal(
      isValidExtraCustomerPickup({
        pickupDate: TOMORROW,
        pickupTime: "17:30",
        pickupAvailableFromAt: cross.pickupAvailableFromIso,
        orderCutoffAt: cross.orderCutoffIso,
        now: extraPickupThroughIso(TOMORROW, "14:00")
          ? new Date(Date.parse(extraPickupThroughIso(TOMORROW, "14:00")!) - 60_000)
          : MID_MORNING,
      }),
      true,
      "pickup after order cutoff remains a valid operating slot",
    );
  }
}

{
  const past = evaluateExtraConfirm({
    pickupFromDate: TODAY,
    pickupFromSlot: "12:00",
    cutoffDate: TODAY,
    cutoffSlot: "12:00",
    todayYmd: TODAY,
    now: ONE_PM,
  });
  assert.equal(past.ok, false, "past cutoff rejected");
  if (!past.ok) assert.equal(past.error, EXTRA_THROUGH_TIME_PAST);
}

{
  const inverted = evaluateExtraConfirm({
    pickupFromDate: TOMORROW,
    pickupFromSlot: "15:00",
    cutoffDate: TODAY,
    cutoffSlot: "17:30",
    todayYmd: TODAY,
    now: MID_MORNING,
  });
  assert.equal(inverted.ok, false, "pickup-from after cutoff rejected");
  if (!inverted.ok) assert.equal(inverted.error, EXTRA_FROM_AFTER_CUTOFF);
}

{
  const odd = evaluateExtraConfirm({
    pickupFromDate: TODAY,
    pickupFromSlot: "12:00",
    cutoffDate: TODAY,
    cutoffSlot: "12:15",
    todayYmd: TODAY,
    now: MID_MORNING,
  });
  assert.equal(odd.ok, false);
  if (!odd.ok) assert.equal(odd.error, EXTRA_CUTOFF_NOT_OPERATING);
}

{
  const lateNight = evaluateExtraConfirm({
    pickupFromDate: TODAY,
    pickupFromSlot: "12:00",
    cutoffDate: TODAY,
    cutoffSlot: "23:30",
    todayYmd: TODAY,
    now: MID_MORNING,
  });
  assert.equal(lateNight.ok, false, "11:30 PM is not an operating-hour cutoff");
}

{
  const decision = evaluateExtraConfirm({
    pickupFromDate: TODAY,
    pickupFromSlot: "12:00",
    cutoffDate: TODAY,
    cutoffSlot: "17:30",
    todayYmd: TODAY,
    now: MID_MORNING,
  });
  assert.equal(decision.ok, true, "A pickup today → cutoff today");
}

{
  const decision = evaluateExtraConfirm({
    pickupFromDate: TODAY,
    pickupFromSlot: "12:00",
    cutoffDate: TOMORROW,
    cutoffSlot: "14:00",
    todayYmd: TODAY,
    now: MID_MORNING,
  });
  assert.equal(decision.ok, true, "B pickup today → cutoff tomorrow");
}

{
  const decision = evaluateExtraConfirm({
    pickupFromDate: TOMORROW,
    pickupFromSlot: "12:00",
    cutoffDate: TOMORROW,
    cutoffSlot: "17:30",
    todayYmd: TODAY,
    now: MID_MORNING,
  });
  assert.equal(decision.ok, true, "C pickup tomorrow → cutoff tomorrow");
}

{
  const decision = evaluateExtraConfirm({
    pickupFromDate: TOMORROW,
    pickupFromSlot: "12:00",
    cutoffDate: WEDNESDAY,
    cutoffSlot: "14:00",
    todayYmd: TODAY,
    now: MID_MORNING,
  });
  assert.equal(decision.ok, true, "D pickup tomorrow → cutoff +1 day");
  if (decision.ok) {
    assert.equal(decision.pickupFromDate, TOMORROW);
    assert.equal(decision.cutoffDate, WEDNESDAY);
    assert.equal(
      isPublishedFreshPick({
        lifecycle: "confirmed",
        pickupThroughAt: decision.orderCutoffIso,
        now: new Date("2026-08-19T05:00:00.000Z"),
      }),
      true,
      "still orderable Wednesday before 2:00 PM cutoff",
    );
    assert.equal(
      isValidExtraCustomerPickup({
        pickupDate: WEDNESDAY,
        pickupTime: "15:00",
        pickupAvailableFromAt: decision.pickupAvailableFromIso,
        orderCutoffAt: decision.orderCutoffIso,
        now: new Date("2026-08-19T05:00:00.000Z"),
      }),
      true,
      "G pickup after Wednesday 2:00 PM cutoff remains valid",
    );
  }
}

{
  const decision = evaluateExtraConfirm({
    pickupFromDate: TODAY,
    pickupFromSlot: "12:00",
    cutoffDate: WEDNESDAY,
    cutoffSlot: "14:00",
    todayYmd: TODAY,
    now: MID_MORNING,
  });
  assert.equal(decision.ok, false, "E pickup today → cutoff +2 days rejected");
  if (!decision.ok) {
    assert.equal(decision.error, EXTRA_CUTOFF_BEYOND_PICKUP_PLUS_ONE);
  }
}

{
  const decision = evaluateExtraConfirm({
    pickupFromDate: TOMORROW,
    pickupFromSlot: "12:00",
    cutoffDate: THURSDAY,
    cutoffSlot: "14:00",
    todayYmd: TODAY,
    now: MID_MORNING,
  });
  assert.equal(decision.ok, false, "F pickup tomorrow → cutoff +2 days rejected");
  if (!decision.ok) {
    assert.equal(decision.error, EXTRA_CUTOFF_BEYOND_PICKUP_PLUS_ONE);
  }
}

{
  const todayCutoffOptions = extraOrderCutoffDateOptions(TODAY, TODAY).map(
    (option) => option.value,
  );
  assert.deepEqual(todayCutoffOptions, [TODAY, TOMORROW]);
  const tomorrowCutoffOptions = extraOrderCutoffDateOptions(
    TOMORROW,
    TODAY,
  ).map((option) => option.value);
  assert.deepEqual(tomorrowCutoffOptions, [TOMORROW, WEDNESDAY]);
  assert.equal(tomorrowCutoffOptions.includes(THURSDAY), false);
  assert.equal(clampExtraOrderCutoffDate(TOMORROW, TODAY), TOMORROW);
  assert.equal(clampExtraOrderCutoffDate(TODAY, WEDNESDAY), TOMORROW);
}

{
  const wedCutoffSlots = extraOrderCutoffSlotsForDate({
    cutoffDate: WEDNESDAY,
    todayYmd: TODAY,
    now: MID_MORNING,
  });
  assert.equal(wedCutoffSlots.length > 0, true);
  assert.equal(
    wedCutoffSlots.every((slot) => !slot.disabled),
    true,
    "Wednesday order-cutoff times stay selectable when pickup is tomorrow",
  );
}

for (const date of ["2026-08-19", "2026-08-20", "2026-08-22"]) {
  const decision = evaluateExtraConfirm({
    pickupFromDate: date,
    pickupFromSlot: "12:00",
    cutoffDate: date,
    cutoffSlot: "14:00",
    todayYmd: TODAY,
    now: MID_MORNING,
  });
  assert.equal(decision.ok, false, `${date} outside Fresh Picks horizon`);
  if (!decision.ok) {
    assert.equal(decision.error, EXTRA_FRESH_PICKS_TODAY_OR_TOMORROW);
  }
}

{
  const window = {
    pickupAvailableFromAt: extraPickupThroughIso(TODAY, "12:00")!,
    orderCutoffAt: extraPickupThroughIso(TODAY, "14:00")!,
  };
  const slotsAtOne = extraCustomerPickupSlotsForDate(TODAY, window, ONE_PM);
  const values = slotsAtOne.map((s) => s.value);
  assert.equal(values.includes("12:00"), false, "past pickup slots hidden");
  assert.equal(values.includes("13:00"), true, "same-day pickup after pickup-from");
  assert.equal(values.includes("14:00"), true);
  assert.equal(values.includes("14:30"), true, "pickup not truncated at order cutoff");
  assert.equal(values.includes("17:30"), true);
  assert.equal(values.includes("18:00"), false, "never outside operating hours");
  assert.equal(
    isValidExtraCustomerPickup({
      pickupDate: TODAY,
      pickupTime: "17:30",
      ...window,
      now: ONE_PM,
    }),
    true,
  );
}

{
  const window = {
    pickupAvailableFromAt: extraPickupThroughIso(TODAY, "12:00")!,
    orderCutoffAt: extraPickupThroughIso(TOMORROW, "14:00")!,
  };
  assert.deepEqual(extraPickupDates(window), [TODAY, TOMORROW]);
  const tomorrowSlots = extraCustomerPickupSlotsForDate(
    TOMORROW,
    window,
    MID_MORNING,
  ).map((s) => s.value);
  assert.equal(tomorrowSlots[0], "12:00");
  assert.equal(tomorrowSlots.at(-1), "17:30");
  assert.equal(tomorrowSlots.includes("14:30"), true);
}

{
  const window = {
    pickupAvailableFromAt: extraPickupThroughIso(TOMORROW, "12:00")!,
    orderCutoffAt: extraPickupThroughIso(WEDNESDAY, "14:00")!,
  };
  assert.deepEqual(extraPickupDates(window), [TOMORROW, WEDNESDAY]);
  const wedSlots = extraCustomerPickupSlotsForDate(
    WEDNESDAY,
    window,
    new Date("2026-08-19T05:00:00.000Z"),
  ).map((s) => s.value);
  assert.equal(wedSlots.includes("14:30"), true, "G pickup not truncated at 2:00 PM");
  assert.equal(wedSlots.includes("15:00"), true);
  assert.equal(wedSlots.includes("15:30"), false);
}

{
  const wedWindow = {
    pickupAvailableFromAt: extraPickupThroughIso(WEDNESDAY, "13:00")!,
    orderCutoffAt: extraPickupThroughIso(WEDNESDAY, "14:00")!,
  };
  const nowBeforeCutoff = new Date("2026-08-19T05:00:00.000Z"); // 1:00 PM SG Wed
  const values = extraCustomerPickupSlotsForDate(
    WEDNESDAY,
    wedWindow,
    nowBeforeCutoff,
  ).map((s) => s.value);
  assert.equal(values.includes("12:00"), false, "before pickup-from");
  assert.equal(values.includes("13:00"), true);
  assert.equal(values.includes("14:00"), true);
  assert.equal(values.includes("14:30"), true, "after Wed 2 PM cutoff still pickable");
  assert.equal(values.includes("15:00"), true);
  assert.equal(values.includes("15:30"), false);
}

assert.equal(
  isPublishedFreshPick({
    lifecycle: "confirmed",
    pickupThroughAt: extraPickupThroughIso(TODAY, "17:30"),
    soldAt: "2026-08-17T04:05:00.000Z",
    now: MID_MORNING,
  }),
  false,
  "H sold-out immediately disappears",
);
assert.equal(
  isExtraAvailable({
    lifecycle: "confirmed",
    pickupThroughAt: extraPickupThroughIso(TODAY, "17:30"),
    soldAt: "2026-08-17T04:05:00.000Z",
    now: MID_MORNING,
  }),
  false,
  "sold-out cannot be ordered",
);

assert.equal(
  extraCustomerAvailabilityLabel({
    pickupAvailableFromAt: extraPickupThroughIso(TODAY, "15:00"),
    todayYmd: TODAY,
  }),
  "Available today",
);
assert.equal(
  extraCustomerAvailabilityLabel({
    pickupAvailableFromAt: extraPickupThroughIso(TOMORROW, "12:00"),
    todayYmd: TODAY,
  }),
  "Available tomorrow",
);

{
  const todayWindow = {
    pickupAvailableFromAt: extraPickupThroughIso(TODAY, "12:00")!,
    orderCutoffAt: extraPickupThroughIso(TODAY, "17:30")!,
  };
  const crossWindow = {
    pickupAvailableFromAt: extraPickupThroughIso(TODAY, "12:00")!,
    orderCutoffAt: extraPickupThroughIso(TOMORROW, "14:00")!,
  };
  const tomorrowWindow = {
    pickupAvailableFromAt: extraPickupThroughIso(TOMORROW, "12:00")!,
    orderCutoffAt: extraPickupThroughIso(TOMORROW, "17:30")!,
  };
  assert.equal(
    extraActionableFreshPickDay({
      pickupAvailableFromAt: todayWindow.pickupAvailableFromAt,
      orderCutoffAt: todayWindow.orderCutoffAt,
      todayYmd: TODAY,
      now: MID_MORNING,
    }),
    "today",
    "1. today before pickup/operating window → Available today (Malaysia time)",
  );
  assert.equal(
    extraActionableFreshPickDay({
      pickupAvailableFromAt: todayWindow.pickupAvailableFromAt,
      orderCutoffAt: todayWindow.orderCutoffAt,
      todayYmd: TODAY,
      now: AFTER_MONDAY_HOURS,
    }),
    null,
    "2. after Monday hours → not Available today (Malaysia time)",
  );
  assert.equal(
    extraActionableFreshPickDay({
      pickupAvailableFromAt: tomorrowWindow.pickupAvailableFromAt,
      orderCutoffAt: tomorrowWindow.orderCutoffAt,
      todayYmd: TODAY,
      now: MID_MORNING,
    }),
    "tomorrow",
    "3. tomorrow window → Available tomorrow (Malaysia time)",
  );
  assert.equal(
    extraActionableFreshPickDay({
      pickupAvailableFromAt: crossWindow.pickupAvailableFromAt,
      orderCutoffAt: crossWindow.orderCutoffAt,
      todayYmd: TODAY,
      now: MID_MORNING,
    }),
    "today",
    "before hours end, Extra still available today stays Available today",
  );
  assert.equal(
    extraActionableFreshPickDay({
      pickupAvailableFromAt: tomorrowWindow.pickupAvailableFromAt,
      orderCutoffAt: tomorrowWindow.orderCutoffAt,
      todayYmd: TODAY,
      now: AFTER_MONDAY_HOURS,
    }),
    "tomorrow",
    "after Monday hours, tomorrow Extra stays Available tomorrow",
  );
  assert.equal(
    extraActionableFreshPickDay({
      pickupAvailableFromAt: crossWindow.pickupAvailableFromAt,
      orderCutoffAt: crossWindow.orderCutoffAt,
      todayYmd: TODAY,
      now: AFTER_MONDAY_HOURS,
    }),
    "tomorrow",
    "4. today exhausted, tomorrow still has pickup hours → Available tomorrow",
  );
  assert.equal(
    extraActionableFreshPickDay({
      pickupAvailableFromAt: todayWindow.pickupAvailableFromAt,
      orderCutoffAt: todayWindow.orderCutoffAt,
      todayYmd: TODAY,
      now: AFTER_MONDAY_HOURS,
    }),
    null,
    "5. no remaining today/tomorrow pickup → hidden",
  );
  assert.deepEqual(
    extraOrderablePickupDates(crossWindow, AFTER_MONDAY_HOURS),
    [TOMORROW],
    "order form skips exhausted today and offers tomorrow (Malaysia time)",
  );
  assert.equal(
    extraActionableFreshPickDay({
      pickupAvailableFromAt: todayWindow.pickupAvailableFromAt,
      orderCutoffAt: todayWindow.orderCutoffAt,
      todayYmd: TODAY,
      now: ONE_PM,
    }),
    "today",
    "during Monday pickup hours → Available today (Malaysia time)",
  );
  assert.equal(
    extraActionableFreshPickDay({
      pickupAvailableFromAt: tomorrowWindow.pickupAvailableFromAt,
      orderCutoffAt: tomorrowWindow.orderCutoffAt,
      todayYmd: TOMORROW,
      now: new Date("2026-08-18T02:15:00.000Z"),
    }),
    "today",
    "date rollover: yesterday's tomorrow is Available today (Malaysia time)",
  );
  assert.deepEqual(
    extraOrderablePickupDates(todayWindow, MID_MORNING),
    [TODAY],
    "order form defaults to today while Monday still has pickup slots",
  );
  assert.deepEqual(
    extraOrderablePickupDates(tomorrowWindow, AFTER_MONDAY_HOURS),
    [TOMORROW],
    "order form offers tomorrow when today has no remaining slots",
  );
}

{
  const both = homepageFreshPicksHorizon(["today", "tomorrow"]);
  const onlyTomorrow = homepageFreshPicksHorizon(["tomorrow", "tomorrow"]);
  const onlyToday = homepageFreshPicksHorizon(["today"]);
  const none = homepageFreshPicksHorizon([]);
  assert.deepEqual(both, { hasToday: true, hasTomorrow: true });
  assert.deepEqual(onlyTomorrow, { hasToday: false, hasTomorrow: true });
  assert.deepEqual(onlyToday, { hasToday: true, hasTomorrow: false });
  assert.deepEqual(none, { hasToday: false, hasTomorrow: false });
  assert.equal(
    homepageFreshPicksDescription(both),
    "Special cakes released by Bakery for today or tomorrow.",
  );
  assert.equal(
    homepageFreshPicksDescription(onlyTomorrow),
    "Special cakes released by Bakery for tomorrow.",
  );
  assert.equal(
    homepageFreshPicksDescription(onlyToday),
    "Special cakes released by Bakery for today.",
  );
  assert.equal(
    homepageFreshPicksDescription(none),
    "Fresh Picks are currently unavailable.",
  );
  assert.equal(
    homepageFreshPicksCountCopy(2, both),
    "2 cakes available today or tomorrow",
  );
  assert.equal(
    homepageFreshPicksCountCopy(1, onlyTomorrow),
    "1 cake available tomorrow",
  );
  assert.equal(
    homepageFreshPicksCountCopy(3, onlyToday),
    "3 cakes available today",
  );
  assert.equal(homepageFreshPicksCountCopy(0, none), "No Fresh Picks right now");
}

assert.equal(toBusinessDateKey(new Date("2026-08-16T16:00:00.000Z")), TODAY);
assert.equal(toBusinessDateKey(new Date("2026-08-17T15:59:59.000Z")), TODAY);
assert.equal(toBusinessDateKey(new Date("2026-08-17T16:00:00.000Z")), TOMORROW);

{
  const endOfHours = new Date("2026-08-17T09:45:00.000Z"); // 5:45 PM SG after 17:30
  const slots = extraOrderCutoffSlotsForDate({
    cutoffDate: TODAY,
    todayYmd: TODAY,
    now: endOfHours,
  });
  assert.equal(
    slots.every((slot) => slot.disabled),
    true,
    "no remaining today cutoff after operating hours",
  );
  assert.equal(
    defaultExtraOrderCutoffSlot({
      cutoffDate: TODAY,
      todayYmd: TODAY,
      now: endOfHours,
    }),
    null,
  );
  const tomorrowOk = evaluateExtraConfirm({
    pickupFromDate: TOMORROW,
    pickupFromSlot: "12:00",
    cutoffDate: TOMORROW,
    cutoffSlot: "14:00",
    todayYmd: TODAY,
    now: endOfHours,
  });
  assert.equal(tomorrowOk.ok, true, "tomorrow still confirmable after today hours");
}

assert.equal(
  defaultExtraPickupFromSlot({
    pickupFromDate: TODAY,
    todayYmd: TODAY,
    now: MID_MORNING,
  }),
  "12:00",
);

assert.equal(
  formatExtraPickupThroughClock(extraPickupThroughIso(TODAY, "14:00")!),
  "2:00 PM",
);
assert.equal(
  formatExtraBoardWindowInstant(extraPickupThroughIso(TODAY, "12:00")!),
  "17 Aug 2026 (Mon), 12:00 PM Malaysia time",
  "same-day ExtraBoard pickup-from includes weekday and date",
);
assert.equal(
  formatExtraBoardWindowInstant(extraPickupThroughIso(TODAY, "15:00")!),
  "17 Aug 2026 (Mon), 3:00 PM Malaysia time",
  "same-day ExtraBoard cutoff includes the same date",
);
assert.equal(
  formatExtraBoardWindowInstant(extraPickupThroughIso(TOMORROW, "15:00")!),
  "18 Aug 2026 (Tue), 3:00 PM Malaysia time",
  "next-day cutoff displays Tuesday",
);
assert.equal(
  formatExtraBoardWindowInstant(extraPickupThroughIso(WEDNESDAY, "12:00")!),
  "19 Aug 2026 (Wed), 12:00 PM Malaysia time",
  "pickup tomorrow + cutoff following day displays Wednesday",
);
assert.equal(
  `Pickup available from ${formatExtraBoardWindowInstant(extraPickupThroughIso(TODAY, "12:00")!)}`,
  "Pickup available from 17 Aug 2026 (Mon), 12:00 PM Malaysia time",
);
assert.equal(
  `Orders available through ${formatExtraBoardWindowInstant(extraPickupThroughIso(TOMORROW, "15:00")!)}`,
  "Orders available through 18 Aug 2026 (Tue), 3:00 PM Malaysia time",
);

for (const role of ["bakery", "manager", "owner"] as const) {
  assert.equal(
    buildExtraWorkspaceCapabilities({ role, staffId: role }).canUnconfirmExtra,
    true,
  );
}

const boardSrc = readFileSync(
  resolve(process.cwd(), "src/workspaces/extra/ExtraBoard.tsx"),
  "utf8",
);
assert.match(boardSrc, /Pickup available from/);
assert.match(boardSrc, /Orders available through/);
assert.match(boardSrc, /Confirm Available/);
assert.match(boardSrc, /Undo availability/);
assert.match(boardSrc, /extraOrderCutoffDateOptions/);
assert.match(boardSrc, /formatExtraBoardWindowInstant/);
assert.doesNotMatch(boardSrc, /Asia\/Singapore/);
assert.doesNotMatch(boardSrc, /Singapore time/);
assert.doesNotMatch(boardSrc, /\bSGT\b/);
assert.doesNotMatch(boardSrc, /formatExtraPickupThroughClock/);

const extraTimeSrc = readFileSync(
  resolve(process.cwd(), "src/engines/extra/fresh-picks-time.ts"),
  "utf8",
);
assert.match(extraTimeSrc, /formatExtraBoardWindowInstant/);
assert.match(extraTimeSrc, /Malaysia time/);
assert.match(extraTimeSrc, /timeZone: "Asia\/Singapore"/);
assert.match(boardSrc, /Order cutoff is the last time a new customer may place an order/);
assert.match(boardSrc, /Pickup times follow bakery hours/);
assert.doesNotMatch(boardSrc, /pickup through/i);
assert.equal(/datetime-local/.test(boardSrc), false);
assert.equal(/EXTRA_THROUGH_SLOTS/.test(boardSrc), false);
assert.doesNotMatch(boardSrc, /11:30 PM/);

const extraPageSrc = readFileSync(
  resolve(process.cwd(), "src/workspaces/storefront/home/StorefrontExtraPage.tsx"),
  "utf8",
);
assert.match(extraPageSrc, /href=\{`\/extra\/\$\{pick\.id\}`\}/);
assert.doesNotMatch(extraPageSrc, /Through /);
assert.doesNotMatch(extraPageSrc, /Available until/);
assert.doesNotMatch(extraPageSrc, /submit_guest_preorder/);
assert.doesNotMatch(extraPageSrc, /×\s*2/);
assert.doesNotMatch(boardSrc, /selectCustomerFreshPickOfferings/);

const extraFormSrc = readFileSync(
  resolve(process.cwd(), "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx"),
  "utf8",
);
assert.match(extraFormSrc, /submitGuestExtraOrder/);
assert.match(extraFormSrc, /extraOrderablePickupDates/);
assert.match(extraFormSrc, /name="extra_stock_id"/);
assert.match(extraFormSrc, /value=\{extra\.id\}/);
assert.match(extraFormSrc, /name="customer_name"/);
assert.match(extraFormSrc, /name="phone"/);
assert.match(extraFormSrc, /name="email"/);
assert.match(extraFormSrc, /name="notes"/);
assert.match(extraFormSrc, /email_submission_receipt_requested/);
assert.match(extraFormSrc, /name="pickup_date"/);
assert.match(extraFormSrc, /name="pickup_time"/);
assert.match(extraFormSrc, /extraCustomerPickupSlotsForDate/);
assert.match(extraFormSrc, /htmlFor="pickup_date"/);
assert.match(extraFormSrc, /htmlFor="pickup_time"/);
assert.match(extraFormSrc, /name="include_receipt"/);
assert.match(
  extraFormSrc,
  /Would you like a copy of the receipt\? \(will be attached during pickup\)/,
);
assert.match(extraFormSrc, /name="complimentary_code"/);
assert.match(extraFormSrc, /loadExtraComplimentaryOptions/);
assert.doesNotMatch(extraFormSrc, /<FormField[\s\S]*htmlFor="pickup_date"/);
assert.doesNotMatch(extraFormSrc, /<FormField[\s\S]*htmlFor="pickup_time"/);
assert.doesNotMatch(extraFormSrc, /submit_guest_preorder/);
assert.doesNotMatch(extraFormSrc, /GuestCheckoutForm/);
assert.doesNotMatch(extraFormSrc, /disabled=\{true\}/);
assert.doesNotMatch(extraFormSrc, /birthday_card/);
assert.doesNotMatch(extraFormSrc, /wishing_card/);

const extraActionsSrc = readFileSync(
  resolve(process.cwd(), "src/workspaces/storefront/extra/actions.ts"),
  "utf8",
);
assert.match(extraActionsSrc, /submit_guest_extra_order/);
assert.match(extraActionsSrc, /p_include_receipt/);
assert.match(extraActionsSrc, /p_complimentary/);
assert.match(extraActionsSrc, /parseRequiredPhysicalReceipt/);
assert.match(extraActionsSrc, /customerComplimentaryMutationPayload/);
assert.doesNotMatch(extraActionsSrc, /submit_guest_preorder/);
assert.doesNotMatch(extraActionsSrc, /storefront_collection_for_pickup_date/);
assert.doesNotMatch(extraActionsSrc, /p_paid_addons/);

const actionsSrc = readFileSync(
  resolve(process.cwd(), "src/workspaces/extra/actions.ts"),
  "utf8",
);
assert.match(actionsSrc, /evaluateExtraConfirm/);
assert.match(actionsSrc, /p_pickup_available_from_at/);
assert.match(actionsSrc, /unconfirm_extra_stock/);
assert.doesNotMatch(actionsSrc, /storefront_collection_for_pickup_date/);

const migrationSrc = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260817140000_extra_pickup_from_order_cutoff.sql",
  ),
  "utf8",
);
assert.match(migrationSrc, /pickup_available_from_at/);
assert.match(migrationSrc, /sold_at/);
assert.match(migrationSrc, /ORDER CUTOFF/);
assert.match(migrationSrc, /submit_guest_extra_order/);
assert.match(migrationSrc, /Cannot undo a sold Extra/);
assert.match(migrationSrc, /for update/);
assert.match(migrationSrc, /orders_extra_stock_id_unique/);
assert.match(migrationSrc, /extra_stock_pickup_from_order_cutoff_fields/);
{
  const backfillAt = migrationSrc.indexOf(
    "where e.lifecycle = 'confirmed'\n  and e.pickup_available_from_at is null",
  );
  const confirmedCheckAt = migrationSrc.indexOf(
    "add constraint extra_stock_confirmed_requires_fields",
  );
  const pairingCheckAt = migrationSrc.indexOf(
    "add constraint extra_stock_pickup_from_order_cutoff_fields",
  );
  assert.ok(backfillAt >= 0, "legacy confirmed backfill present");
  assert.ok(
    confirmedCheckAt > backfillAt && pairingCheckAt > backfillAt,
    "window CHECKs must be added after filling pickup_available_from_at",
  );
}
assert.doesNotMatch(migrationSrc, /storefront_collection_for_pickup_date/);
assert.doesNotMatch(migrationSrc, /submit_guest_preorder/);

const cutoffPlusOneSrc = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260817150000_extra_order_cutoff_plus_one_day.sql",
  ),
  "utf8",
);
assert.match(cutoffPlusOneSrc, /v_through_date > v_from_date \+ 1/);
assert.match(
  cutoffPlusOneSrc,
  /Order cutoff must be on the pickup-from date or the next calendar day/,
);
assert.doesNotMatch(cutoffPlusOneSrc, /storefront_collection_for_pickup_date/);
assert.doesNotMatch(cutoffPlusOneSrc, /submit_guest_preorder/);

const extraReceiptMigrationSrc = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260818150000_guest_extra_include_receipt_complimentary.sql",
  ),
  "utf8",
);
assert.match(
  extraReceiptMigrationSrc,
  /p_include_receipt boolean default false/,
);
assert.match(
  extraReceiptMigrationSrc,
  /p_complimentary jsonb default '\[\]'::jsonb/,
);
assert.match(extraReceiptMigrationSrc, /orders\.include_receipt/);
assert.match(extraReceiptMigrationSrc, /order_complimentary_items/);
assert.match(extraReceiptMigrationSrc, /storefront_collection_for_pickup_date/);
assert.match(extraReceiptMigrationSrc, /Do not auto-insert collection defaults/);
assert.doesNotMatch(extraReceiptMigrationSrc, /submit_guest_preorder/);
assert.doesNotMatch(extraReceiptMigrationSrc, /alter table public\.orders add/i);
assert.doesNotMatch(extraReceiptMigrationSrc, /p_paid_addons/);

console.log("Fresh Picks eligibility / pickup / cutoff: PASS");
