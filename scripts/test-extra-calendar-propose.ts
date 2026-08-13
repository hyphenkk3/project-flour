/**
 * EXTRA v1.1 — Calendar-assisted proposal helpers (no DB).
 * Run: npx tsx scripts/test-extra-calendar-propose.ts
 */
import assert from "node:assert/strict";
import {
  buildCalendarExtraProposePrefill,
  defaultPreparedOnFromFulfilmentDate,
} from "@/engines/extra/prepared-on-default";
import {
  isExtraActiveOnCalendar,
  mapExtraStockRowToCalendarMarker,
} from "@/engines/extra/calendar-visibility";
import { isExtraAvailable } from "@/engines/extra/availability";
import { buildCalendarMatrix } from "@/workspaces/owner/calendar/matrix";
import type { CalendarEntry } from "@/workspaces/owner/calendar/types";

assert.equal(
  defaultPreparedOnFromFulfilmentDate("2026-08-17"),
  "2026-08-16",
  "17 Aug -> prepared_on default 16 Aug",
);

assert.equal(
  defaultPreparedOnFromFulfilmentDate("2026-09-01"),
  "2026-08-31",
  "1 Sep -> 31 Aug",
);

assert.equal(
  defaultPreparedOnFromFulfilmentDate("2026-01-01"),
  "2025-12-31",
  "1 Jan -> 31 Dec previous year",
);

const chocolate = buildCalendarExtraProposePrefill({
  cakeName: "Chocolate D'Amour",
  sizeLabel: '6"',
  cakeId: "cake-uuid-1",
  cakeSizeId: "size-uuid-1",
  fulfilmentDateYmd: "2026-08-17",
});
assert.equal(chocolate.preparedOn, "2026-08-16");

assert.equal(
  isExtraActiveOnCalendar({
    lifecycle: "proposed",
    preparedOn: "2026-08-17",
    pickupThroughAt: null,
  }),
  true,
  "proposed with prepared_on is active on calendar",
);

assert.equal(
  isExtraActiveOnCalendar({
    lifecycle: "rejected",
    preparedOn: "2026-08-17",
    pickupThroughAt: null,
  }),
  false,
  "rejected never active on calendar",
);

assert.equal(
  isExtraActiveOnCalendar({
    lifecycle: "proposed",
    preparedOn: null,
    pickupThroughAt: null,
  }),
  false,
  "null prepared_on does not invent a date",
);

assert.equal(
  isExtraActiveOnCalendar({
    lifecycle: "confirmed",
    preparedOn: "2026-08-17",
    pickupThroughAt: "2026-08-17T10:00:00.000Z",
    now: new Date("2026-08-17T11:00:00.000Z"),
  }),
  false,
  "confirmed past pickup-through excluded from active planning",
);

const marker = mapExtraStockRowToCalendarMarker({
  id: "extra-1",
  cake_name: "Chocolate D'Amour",
  size_label: '6"',
  lifecycle: "proposed",
  prepared_on: "2026-08-17",
  pickup_through_at: null,
  library_cake_id: null,
  library_cake_size_id: null,
});
assert.ok(marker);
assert.equal(marker!.preparedOn, "2026-08-17");

const orderEntry: CalendarEntry = {
  kind: "order",
  id: "order-1",
  pickupDate: "2026-08-17",
  pickupTime: "16:00:00",
  fulfilmentMethod: "pickup",
  customerName: "Amy",
  displayName: "Amy",
  status: "paid",
  needsBakeryAttention: false,
  hasEffectiveRm10: false,
  readyAt: null,
  pickedUpAt: null,
  outForDeliveryAt: null,
  deliveredAt: null,
  items: [
    {
      id: "item-1",
      cakeName: "Chocolate D'Amour",
      sizeLabel: '6"',
      quantity: 1,
    },
  ],
};

const matrix = buildCalendarMatrix(
  [orderEntry],
  ["2026-08-17"],
  [
    {
      id: "extra-1",
      preparedOn: "2026-08-17",
      cakeName: "Chocolate D'Amour",
      sizeLabel: '6"',
      lifecycle: "proposed",
      libraryCakeId: null,
      libraryCakeSizeId: null,
      pickupThroughAt: null,
    },
  ],
);
assert.equal(matrix.length, 1);
assert.equal(matrix[0]!.cellsByDate["2026-08-17"]!.customers.length, 1);
assert.equal(matrix[0]!.cellsByDate["2026-08-17"]!.extras.length, 1);
assert.equal(
  matrix[0]!.cellsByDate["2026-08-17"]!.extras[0]!.lifecycle,
  "proposed",
);
assert.equal(
  isExtraAvailable({
    lifecycle: "proposed",
    pickupThroughAt: null,
  }),
  false,
  "proposed calendar EXTRA is never Available",
);

console.log("EXTRA calendar-assisted propose helpers: PASS");
