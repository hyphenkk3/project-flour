/**
 * Fresh Pick whole-cake disposition + calendar sold/sliced visibility.
 * Run: npx tsx scripts/test-extra-whole-cake-disposition.ts
 *
 * Does not mutate live Extra inventory or customer orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isExtraAvailable } from "@/engines/extra/availability";
import {
  extraCalendarBadgeStatus,
  isExtraActiveOnCalendar,
  mapExtraStockRowToCalendarMarker,
} from "@/engines/extra/calendar-visibility";
import { buildExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";
import { isPublishedFreshPick } from "@/engines/extra/customer-fresh-picks";
import { timelineEventLabel } from "@/engines/orders/timeline";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const availableBase = {
  lifecycle: "confirmed" as const,
  pickupThroughAt: "2099-01-01T10:00:00.000Z",
  soldAt: null as string | null,
  cutIntoSlicesAt: null as string | null,
};

assert.equal(isExtraAvailable(availableBase), true);
assert.equal(
  isExtraAvailable({ ...availableBase, soldAt: "2026-09-09T00:00:00.000Z" }),
  false,
);
assert.equal(
  isExtraAvailable({
    ...availableBase,
    cutIntoSlicesAt: "2026-09-09T00:00:00.000Z",
  }),
  false,
);

assert.equal(
  isExtraActiveOnCalendar({
    lifecycle: "confirmed",
    preparedOn: "2026-09-09",
    pickupThroughAt: availableBase.pickupThroughAt,
    soldAt: "2026-09-09T00:00:00.000Z",
  }),
  false,
  "sold Extra is not active on Whole Cake Calendar",
);
assert.equal(
  isExtraActiveOnCalendar({
    lifecycle: "confirmed",
    preparedOn: "2026-09-09",
    pickupThroughAt: availableBase.pickupThroughAt,
    cutIntoSlicesAt: "2026-09-09T00:00:00.000Z",
  }),
  false,
  "sliced Extra is not active on Whole Cake Calendar",
);
assert.equal(
  isExtraActiveOnCalendar({
    lifecycle: "confirmed",
    preparedOn: "2026-09-09",
    pickupThroughAt: availableBase.pickupThroughAt,
  }),
  true,
);

assert.equal(
  isPublishedFreshPick({
    lifecycle: "confirmed",
    pickupThroughAt: availableBase.pickupThroughAt,
    soldAt: null,
    cutIntoSlicesAt: "2026-09-09T00:00:00.000Z",
  }),
  false,
  "customers do not see sliced extras",
);

assert.equal(
  extraCalendarBadgeStatus("confirmed"),
  "Available",
);
assert.equal(extraCalendarBadgeStatus("proposed"), "Proposed");
assert.doesNotMatch(
  extraCalendarBadgeStatus("confirmed"),
  /EXTRA confirmed/i,
);

assert.equal(timelineEventLabel("extra_assigned"), "Fresh Pick assigned");

const calendarNow = new Date("2026-09-09T06:00:00.000Z");
const unsoldMarker = mapExtraStockRowToCalendarMarker(
  {
    id: "extra-a",
    cake_name: "Avocado",
    size_label: '6"',
    lifecycle: "confirmed",
    prepared_on: "2026-09-09",
    pickup_available_from_at: "2026-09-09T04:00:00.000Z",
    pickup_through_at: "2026-09-10T10:00:00.000Z",
    library_cake_id: null,
    library_cake_size_id: null,
    sold_at: null,
  },
  calendarNow,
);
assert.ok(unsoldMarker);
assert.equal(unsoldMarker!.id, "extra-a");

const twinSold = mapExtraStockRowToCalendarMarker(
  {
    id: "extra-b",
    cake_name: "Avocado",
    size_label: '6"',
    lifecycle: "confirmed",
    prepared_on: "2026-09-09",
    pickup_available_from_at: "2026-09-09T04:00:00.000Z",
    pickup_through_at: "2026-09-10T10:00:00.000Z",
    library_cake_id: null,
    library_cake_size_id: null,
    sold_at: "2026-09-09T08:00:00.000Z",
  },
  calendarNow,
);
assert.equal(twinSold, null, "identical twin Extra sold independently");

for (const role of ["bakery", "manager", "owner"] as const) {
  const caps = buildExtraWorkspaceCapabilities({ role, staffId: role });
  assert.equal(caps.canAssignExtraToOrder, true);
  assert.equal(caps.canMoveExtraWindow, true);
  assert.equal(caps.canCutExtraIntoSlices, true);
  assert.equal(caps.canUnconfirmExtra, true);
}
for (const role of ["collection", "customer_operations"] as const) {
  const caps = buildExtraWorkspaceCapabilities({ role, staffId: role });
  assert.equal(caps.canAssignExtraToOrder, false);
  assert.equal(caps.canMoveExtraWindow, false);
  assert.equal(caps.canCutExtraIntoSlices, false);
  assert.equal(caps.canUnconfirmExtra, false);
}

const migration = readSrc(
  "supabase/migrations/20260909120000_extra_whole_cake_disposition.sql",
);
assert.match(migration, /cut_into_slices_at/);
assert.match(migration, /extra_stock_events/);
assert.match(migration, /assign_extra_stock_to_order/);
assert.match(migration, /move_extra_stock_fresh_pick_window/);
assert.match(migration, /cut_extra_stock_into_slices/);
assert.match(migration, /_extra_stock_guard_disposition/);
assert.match(migration, /inserted_order_item', false/);
assert.match(migration, /for update/);
assert.match(migration, /_assert_fresh_picks_confirm_window/);
assert.match(migration, /Cannot undo a sold Extra/);
assert.match(migration, /Cannot undo an Extra that was cut into slices/);
assert.match(migration, /sliced_requires_confirmed/);
assert.match(migration, /Not authorized to assign EXTRA/);
assert.match(migration, /Not authorized to move EXTRA/);
assert.match(migration, /Not authorized to cut EXTRA into slices/);
assert.match(migration, /Not authorized to undo EXTRA availability/);
assert.doesNotMatch(migration, /html2canvas/);

const calendarQueries = readSrc("src/workspaces/owner/calendar/queries.ts");
assert.match(calendarQueries, /sold_at, cut_into_slices_at/);

const calendarView = readSrc(
  "src/workspaces/owner/calendar/CalendarMatrixView.tsx",
);
assert.match(calendarView, /Fresh Pick · \$\{status\}/);
assert.doesNotMatch(calendarView, /EXTRA confirmed/);

const extraQueries = readSrc("src/workspaces/storefront/extra/queries.ts");
assert.match(extraQueries, /\.is\("sold_at", null\)/);
assert.match(extraQueries, /\.is\("cut_into_slices_at", null\)/);

const extraBoardQueries = readSrc("src/workspaces/extra/queries.ts");
assert.match(extraBoardQueries, /in\("extra_stock_id", soldIds\)/);
assert.match(extraBoardQueries, /assignedOrderNumber: linked\.order_number/);

const boardSrc = readSrc("src/workspaces/extra/ExtraBoard.tsx");
assert.match(boardSrc, /Assign to order/);
assert.match(boardSrc, /AssignExtraToOrderDialog/);
assert.match(boardSrc, /MoveExtraWindowDialog/);
assert.match(boardSrc, /CutExtraIntoSlicesDialog/);
assert.match(boardSrc, /Move pickup window/);
assert.match(boardSrc, /Cut into slices/);
assert.match(boardSrc, /Stop Fresh Pick availability/);
assert.match(boardSrc, /Undo availability/);
assert.match(boardSrc, /Assigned · \$\{unit\.assignedOrderNumber\}/);
assert.match(boardSrc, /Cut into slices/);

const extraPage = readSrc(
  "src/workspaces/storefront/home/StorefrontExtraPage.tsx",
);
assert.doesNotMatch(extraPage, /cut into slices/i);
assert.doesNotMatch(extraPage, /Assign to order/);

const actionsSrc = readSrc("src/workspaces/extra/actions.ts");
assert.match(actionsSrc, /assign_extra_stock_to_order/);
assert.match(actionsSrc, /move_extra_stock_fresh_pick_window/);
assert.match(actionsSrc, /cut_extra_stock_into_slices/);
assert.match(actionsSrc, /unconfirm_extra_stock/);

console.log("PASS extra whole-cake disposition");
