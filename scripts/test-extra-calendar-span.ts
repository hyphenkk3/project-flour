/**
 * Whole Cake Calendar EXTRA date-range spanning (no DB).
 * Run: npx tsx scripts/test-extra-calendar-span.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  clipExtraCalendarSpan,
  extraCalendarRangeOverlaps,
  extraCalendarValidRange,
  mapExtraStockRowToCalendarMarker,
  type CalendarExtraMarker,
} from "@/engines/extra/calendar-visibility";
import {
  buildCalendarMatrix,
  matrixRowHasContent,
} from "@/workspaces/owner/calendar/matrix";

function marker(
  input: Partial<CalendarExtraMarker> & Pick<CalendarExtraMarker, "id">,
): CalendarExtraMarker {
  return {
    preparedOn: "2026-08-18",
    cakeName: "Oolong",
    sizeLabel: '6"',
    lifecycle: "confirmed",
    libraryCakeId: null,
    libraryCakeSizeId: null,
    pickupAvailableFromAt: "2026-08-18T04:00:00.000Z",
    pickupThroughAt: "2026-08-19T10:00:00.000Z",
    validFromYmd: "2026-08-18",
    validToYmd: "2026-08-19",
    ...input,
  };
}

assert.deepEqual(
  extraCalendarValidRange({
    lifecycle: "confirmed",
    preparedOn: "2026-08-17",
    pickupAvailableFromAt: "2026-08-18T04:00:00.000Z",
    pickupThroughAt: "2026-08-19T10:00:00.000Z",
  }),
  { validFromYmd: "2026-08-18", validToYmd: "2026-08-19" },
  "confirmed window uses pickup-from → order-cutoff dates",
);

assert.deepEqual(
  extraCalendarValidRange({
    lifecycle: "confirmed",
    preparedOn: "2026-08-18",
    pickupAvailableFromAt: "2026-08-18T04:00:00.000Z",
    pickupThroughAt: "2026-08-20T10:00:00.000Z",
  }),
  { validFromYmd: "2026-08-18", validToYmd: "2026-08-20" },
  "18 → 20 spans three days",
);

assert.deepEqual(
  extraCalendarValidRange({
    lifecycle: "proposed",
    preparedOn: "2026-08-18",
    pickupAvailableFromAt: null,
    pickupThroughAt: null,
  }),
  { validFromYmd: "2026-08-18", validToYmd: "2026-08-18" },
  "proposed stays single-day on prepared_on",
);

assert.deepEqual(
  extraCalendarValidRange({
    lifecycle: "confirmed",
    preparedOn: "2026-08-18",
    pickupAvailableFromAt: "2026-08-18T04:00:00.000Z",
    pickupThroughAt: "2026-08-18T15:00:00.000Z",
  }),
  { validFromYmd: "2026-08-18", validToYmd: "2026-08-18" },
  "same-day confirmed window",
);

const oolong = marker({ id: "extra-oolong" });
const datesThree = ["2026-08-18", "2026-08-19", "2026-08-20"];
const matrixThree = buildCalendarMatrix([], datesThree, [
  {
    ...oolong,
    validFromYmd: "2026-08-18",
    validToYmd: "2026-08-20",
    pickupThroughAt: "2026-08-20T10:00:00.000Z",
  },
]);
assert.equal(matrixThree.length, 1);
assert.equal(matrixThree[0]!.extraSpans.length, 1);
assert.equal(matrixThree[0]!.extraSpans[0]!.columnSpan, 3);
assert.equal(matrixThree[0]!.extraSpans[0]!.extra.id, "extra-oolong");
assert.equal(
  matrixThree[0]!.cellsByDate["2026-08-19"]?.customers.length ?? 0,
  0,
);
assert.equal(
  Object.keys(matrixThree[0]!.cellsByDate).length,
  0,
  "no per-date EXTRA duplication in cells",
);

const datesTwo = ["2026-08-18", "2026-08-19"];
const matrixTwo = buildCalendarMatrix([], datesTwo, [oolong]);
assert.equal(matrixTwo[0]!.extraSpans[0]!.columnSpan, 2);
assert.equal(matrixTwo[0]!.extraSpans[0]!.startYmd, "2026-08-18");
assert.equal(matrixTwo[0]!.extraSpans[0]!.endYmd, "2026-08-19");

const beforeWindow = buildCalendarMatrix([], ["2026-08-17"], [oolong]);
assert.equal(beforeWindow.length, 0, "absent before valid_from");

const afterWindow = buildCalendarMatrix([], ["2026-08-20"], [oolong]);
assert.equal(afterWindow.length, 0, "absent after valid_to");

const partial = buildCalendarMatrix(
  [],
  ["2026-08-19", "2026-08-20", "2026-08-21"],
  [
    {
      ...oolong,
      validFromYmd: "2026-08-18",
      validToYmd: "2026-08-20",
    },
  ],
);
assert.equal(partial[0]!.extraSpans[0]!.startYmd, "2026-08-19");
assert.equal(partial[0]!.extraSpans[0]!.endYmd, "2026-08-20");
assert.equal(partial[0]!.extraSpans[0]!.columnSpan, 2);

const monthBoundary = buildCalendarMatrix(
  [],
  ["2026-08-31", "2026-09-01", "2026-09-02"],
  [
    marker({
      id: "extra-boundary",
      cakeName: "Month Span",
      validFromYmd: "2026-08-31",
      validToYmd: "2026-09-02",
    }),
  ],
);
assert.equal(monthBoundary[0]!.extraSpans[0]!.columnSpan, 3);

const extraA = marker({
  id: "extra-a",
  validFromYmd: "2026-08-18",
  validToYmd: "2026-08-19",
});
const extraB = marker({
  id: "extra-b",
  cakeName: "Oolong",
  validFromYmd: "2026-08-19",
  validToYmd: "2026-08-20",
});
const overlapMatrix = buildCalendarMatrix([], datesThree, [extraA, extraB]);
assert.equal(overlapMatrix[0]!.extraSpans.length, 2);
assert.equal(overlapMatrix[0]!.extraSpans[0]!.extra.id, "extra-a");
assert.equal(overlapMatrix[0]!.extraSpans[1]!.extra.id, "extra-b");

assert.equal(
  extraCalendarRangeOverlaps(
    { validFromYmd: "2026-08-18", validToYmd: "2026-08-19" },
    "2026-08-01",
    "2026-08-31",
  ),
  true,
);

const clipped = clipExtraCalendarSpan(extraA, ["2026-08-18", "2026-08-19"]);
assert.ok(clipped);
assert.equal(clipped!.extra.id, "extra-a");

const mappedNow = new Date("2026-08-18T05:00:00.000Z");
const mapped = mapExtraStockRowToCalendarMarker(
  {
    id: "db-extra-1",
    cake_name: "Oolong",
    size_label: '6"',
    lifecycle: "confirmed",
    prepared_on: "2026-08-17",
    pickup_available_from_at: "2026-08-18T04:00:00.000Z",
    pickup_through_at: "2026-08-19T10:00:00.000Z",
    library_cake_id: null,
    library_cake_size_id: null,
  },
  mappedNow,
);
assert.ok(mapped);
assert.equal(mapped!.validFromYmd, "2026-08-18");
assert.equal(mapped!.validToYmd, "2026-08-19");

const mappedSold = mapExtraStockRowToCalendarMarker({
  id: "db-extra-sold",
  cake_name: "Oolong",
  size_label: '6"',
  lifecycle: "confirmed",
  prepared_on: "2026-08-17",
  pickup_available_from_at: "2026-08-18T04:00:00.000Z",
  pickup_through_at: "2026-08-19T10:00:00.000Z",
  library_cake_id: null,
  library_cake_size_id: null,
  sold_at: "2026-08-18T05:00:00.000Z",
});
assert.equal(mappedSold, null, "sold Extra is not an active calendar marker");

const mappedSliced = mapExtraStockRowToCalendarMarker({
  id: "db-extra-sliced",
  cake_name: "Oolong",
  size_label: '6"',
  lifecycle: "confirmed",
  prepared_on: "2026-08-17",
  pickup_available_from_at: "2026-08-18T04:00:00.000Z",
  pickup_through_at: "2026-08-19T10:00:00.000Z",
  library_cake_id: null,
  library_cake_size_id: null,
  cut_into_slices_at: "2026-08-18T05:00:00.000Z",
});
assert.equal(mappedSliced, null, "sliced Extra is not an active calendar marker");

assert.ok(matrixRowHasContent(matrixTwo[0]!));

const chocolateOrder = {
  kind: "order" as const,
  id: "ord-damour",
  pickupDate: "2026-09-10",
  pickupTime: "15:00:00",
  fulfilmentMethod: "pickup" as const,
  customerName: "Mei",
  displayName: "Mei",
  status: "paid" as const,
  needsBakeryAttention: false,
  hasEffectiveRm10: false,
  readyAt: null,
  pickedUpAt: null,
  outForDeliveryAt: null,
  deliveredAt: null,
  items: [
    {
      id: "item-8",
      cakeName: "Chocolate D'Amour",
      sizeLabel: '8"',
      quantity: 1,
    },
    {
      id: "item-4",
      cakeName: "Chocolate D'Amour",
      sizeLabel: '4"',
      quantity: 1,
    },
  ],
};
const damourMatrix = buildCalendarMatrix(
  [chocolateOrder],
  ["2026-09-10"],
  [
    marker({
      id: "extra-4",
      cakeName: "Chocolate D'Amour",
      sizeLabel: '4"',
      validFromYmd: "2026-09-10",
      validToYmd: "2026-09-10",
    }),
    marker({
      id: "extra-8",
      cakeName: "Chocolate D'Amour",
      sizeLabel: '8"',
      validFromYmd: "2026-09-10",
      validToYmd: "2026-09-10",
    }),
  ],
);
assert.equal(
  damourMatrix.length,
  2,
  "one 4\" + one 8\" is two matrix rows, not four",
);
assert.equal(
  damourMatrix.filter((row) => row.sizeLabel === '4"').length,
  1,
);
assert.equal(
  damourMatrix.filter((row) => row.sizeLabel === '8"').length,
  1,
);
assert.equal(damourMatrix[0]!.extraSpans.length, 1);
assert.equal(damourMatrix[1]!.extraSpans.length, 1);
assert.notEqual(
  damourMatrix[0]!.extraSpans[0]!.extra.id,
  damourMatrix[1]!.extraSpans[0]!.extra.id,
);

const twinExtras = buildCalendarMatrix(
  [],
  ["2026-09-10"],
  [
    marker({
      id: "extra-twin-a",
      cakeName: "Salted Peanut",
      sizeLabel: '6"',
      validFromYmd: "2026-09-10",
      validToYmd: "2026-09-10",
    }),
    marker({
      id: "extra-twin-b",
      cakeName: "Salted Peanut",
      sizeLabel: '6"',
      validFromYmd: "2026-09-10",
      validToYmd: "2026-09-10",
    }),
  ],
);
assert.equal(twinExtras.length, 1);
assert.equal(twinExtras[0]!.extraSpans.length, 2);
assert.equal(twinExtras[0]!.extraSpans[0]!.extra.id, "extra-twin-a");
assert.equal(twinExtras[0]!.extraSpans[1]!.extra.id, "extra-twin-b");

const matrixViewSrc = readFileSync(
  resolve(process.cwd(), "src/workspaces/owner/calendar/CalendarMatrixView.tsx"),
  "utf8",
);
assert.match(matrixViewSrc, /Fresh Pick/);
assert.match(matrixViewSrc, /extraCalendarBadgeStatus/);
assert.doesNotMatch(matrixViewSrc, />EXTRA</);
const extraSpanFn = matrixViewSrc.slice(
  matrixViewSrc.indexOf("function renderExtraSpanRow"),
  matrixViewSrc.indexOf("export function CalendarMatrixView"),
);
assert.match(extraSpanFn, />Fresh Pick</);
assert.doesNotMatch(extraSpanFn, /\{row\.cakeName\}/);
assert.doesNotMatch(extraSpanFn, /\{row\.sizeLabel\}/);

const queriesSrc = readFileSync(
  resolve(process.cwd(), "src/workspaces/owner/calendar/queries.ts"),
  "utf8",
);
assert.match(queriesSrc, /pickup_available_from_at/);
assert.match(queriesSrc, /sold_at, cut_into_slices_at/);
assert.match(queriesSrc, /extraCalendarRangeOverlaps/);
assert.doesNotMatch(queriesSrc, /\.gte\("prepared_on", fromYmd\)/);

console.log("PASS extra calendar date-range spanning");
