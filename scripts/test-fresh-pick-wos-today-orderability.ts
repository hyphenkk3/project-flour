import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import type { OperatingHoursSnapshot } from "@/engines/business-calendar/operating-hours";
import {
  freshPickTodayOrderability,
  type FreshPicksFulfilmentContext,
} from "@/engines/extra/fresh-picks-fulfilment";
import { freshPickTodayStatusLabel } from "@/engines/extra/home-fresh-picks";
import { toBusinessDateKey } from "@/lib/dates";

const TODAY = "2026-10-06";
const TOMORROW = "2026-10-07";
const WINDOW = {
  pickupAvailableFromAt: "2026-10-06T04:00:00.000Z",
  orderCutoffAt: "2026-10-07T07:00:00.000Z",
};
const config = { cutoffTime: "16:00", leadMinutes: 60 };

function context(
  now: string,
  readyForCollection = false,
  snapshot: OperatingHoursSnapshot = OPERATING_HOURS_SEED,
  window = WINDOW,
): FreshPicksFulfilmentContext {
  return {
    window,
    readyForCollection,
    now: new Date(now),
    snapshot,
    config,
  };
}

function onlyMethods(
  methods: Array<"pickup" | "dine_in" | "delivery">,
): OperatingHoursSnapshot {
  const disabled = (capability: "pickup" | "dine_in" | "delivery") => ({
    capability,
    weekday: 2,
    enabled: false,
    opensAt: null,
    closesAt: null,
    latestBookable: null,
    usualStart: null,
    usualEnd: null,
    overrideDate: TODAY,
    note: "focused WOS resolver test",
  });
  const open = (capability: "pickup" | "dine_in" | "delivery") => ({
    capability,
    weekday: 2,
    enabled: true,
    opensAt: "12:00",
    closesAt:
      capability === "pickup"
        ? "17:30"
        : capability === "dine_in"
          ? "17:00"
          : "15:00",
    latestBookable:
      capability === "pickup"
        ? "17:30"
        : capability === "dine_in"
          ? "17:00"
          : "15:00",
    usualStart: null,
    usualEnd: null,
    overrideDate: TODAY,
    note: "focused WOS resolver test",
  });
  return {
    weekly: OPERATING_HOURS_SEED.weekly,
    overrides: (["pickup", "dine_in", "delivery"] as const).map((method) =>
      methods.includes(method) ? open(method) : disabled(method),
    ),
  };
}

const normalPickup = freshPickTodayOrderability(
  context("2026-10-06T06:15:00.000Z", false, onlyMethods(["pickup"])),
);
assert.deepEqual(normalPickup.availableMethods, ["pickup"]);
assert.equal(
  freshPickTodayStatusLabel({
    readyForCollection: false,
    availableToday: true,
  }),
  "AVAILABLE TODAY",
);

const normalDineIn = freshPickTodayOrderability(
  context("2026-10-06T06:15:00.000Z", false, onlyMethods(["dine_in"])),
);
assert.deepEqual(normalDineIn.availableMethods, ["dine_in"]);

const afterCutoff = freshPickTodayOrderability(
  context("2026-10-06T08:30:00.000Z"),
);
assert.deepEqual(afterCutoff.availableMethods, []);
assert.equal(afterCutoff.nextAvailableDate, TOMORROW);
assert.equal(
  freshPickTodayStatusLabel({
    readyForCollection: false,
    availableToday: false,
  }),
  "TODAY CLOSED",
);

const readyPickup = freshPickTodayOrderability(
  context("2026-10-06T08:30:00.000Z", true, onlyMethods(["pickup"])),
);
assert.deepEqual(readyPickup.availableMethods, ["pickup"]);
assert.equal(
  freshPickTodayStatusLabel({ readyForCollection: true, availableToday: true }),
  "AVAILABLE TODAY",
);

const readyDineIn = freshPickTodayOrderability(
  context("2026-10-06T08:30:00.000Z", true, onlyMethods(["dine_in"])),
);
assert.deepEqual(readyDineIn.availableMethods, ["dine_in"]);

const afterHoursReady = freshPickTodayOrderability(
  context("2026-10-06T10:00:00.000Z", true),
);
assert.deepEqual(afterHoursReady.availableMethods, []);
assert.equal(afterHoursReady.nextAvailableDate, TOMORROW);
assert.equal(
  freshPickTodayStatusLabel({
    readyForCollection: true,
    availableToday: false,
  }),
  "NOT ORDERABLE TODAY",
);

const deliveryOnly = freshPickTodayOrderability(
  context("2026-10-06T06:15:00.000Z", true, onlyMethods(["delivery"])),
);
assert.deepEqual(deliveryOnly.availableMethods, []);

const expired = freshPickTodayOrderability(
  context("2026-10-06T06:15:00.000Z", true, onlyMethods(["pickup"]), {
    pickupAvailableFromAt: "2026-10-06T04:00:00.000Z",
    orderCutoffAt: "2026-10-06T06:00:00.000Z",
  }),
);
assert.deepEqual(expired.availableMethods, []);
assert.equal(expired.nextAvailableDate, null);

const sameCakeNotReady = freshPickTodayOrderability(
  context("2026-10-06T08:30:00.000Z", false, onlyMethods(["pickup"])),
);
assert.deepEqual(sameCakeNotReady.availableMethods, []);
assert.deepEqual(readyPickup.availableMethods, ["pickup"]);

const homeSource = readFileSync(
  resolve("src/workspaces/home/HomeFreshPicksOperations.tsx"),
  "utf8",
);
const extraBoardSource = readFileSync(
  resolve("src/workspaces/extra/ExtraBoard.tsx"),
  "utf8",
);
const windowHelperSource = readFileSync(
  resolve("src/engines/extra/walk-in-hold.ts"),
  "utf8",
);
assert.match(homeSource, /FreshPickTodayOrderabilityStatus/);
assert.match(homeSource, /Pickup available from/);
assert.match(homeSource, /freshPickHomeSummaryLine/);
assert.match(windowHelperSource, /Orders available through/);
assert.match(extraBoardSource, /FreshPickTodayOrderabilityStatus/);
assert.match(extraBoardSource, /Pickup available from/);
assert.match(extraBoardSource, /Orders available through/);
assert.equal(toBusinessDateKey(new Date("2026-10-06T08:30:00.000Z")), TODAY);

const querySource = readFileSync(
  resolve("src/workspaces/extra/queries.ts"),
  "utf8",
);
assert.match(querySource, /unit\.soldAt/);
assert.match(querySource, /unit\.cutIntoSlicesAt/);
assert.match(querySource, /freshPickTodayOrderability/);

console.log(
  "PASS: Fresh Pick WOS today-orderability states and preserved windows",
);
