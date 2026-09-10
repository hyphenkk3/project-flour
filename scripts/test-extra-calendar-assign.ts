/**
 * Whole Cake Calendar: click Fresh Pick Extra → assign exact extra_stock.id.
 * Run: npx tsx scripts/test-extra-calendar-assign.ts
 *
 * Static / source wiring only. Does not mutate Extra inventory or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isExtraActiveOnCalendar,
  mapExtraStockRowToCalendarMarker,
} from "@/engines/extra/calendar-visibility";
import { buildExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const matrixSrc = readSrc(
  "src/workspaces/owner/calendar/CalendarMatrixView.tsx",
);
assert.match(matrixSrc, /onOpenExtra/);
assert.match(matrixSrc, /data-extra-id=\{extra\.id\}/);
assert.match(matrixSrc, /type="button"/);
assert.match(matrixSrc, /onClick=\{\(\) => onOpenExtra\?\.\(extra\)\}/);
assert.doesNotMatch(
  matrixSrc,
  /<span[\s\S]*data-extra-id=\{extra\.id\}/,
);

const calendarSrc = readSrc(
  "src/workspaces/owner/calendar/WholeCakeCalendar.tsx",
);
assert.match(calendarSrc, /onOpenExtra=\{openExtra\}/);
assert.match(calendarSrc, /CalendarExtraActionDialog/);
assert.match(calendarSrc, /AssignExtraToOrderDialog/);
assert.match(calendarSrc, /setAssigningExtra\(extra\)/);
assert.match(calendarSrc, /refreshExtrasOnly/);
assert.match(calendarSrc, /candidateOrders=\{assignExtraCandidates\}/);
assert.match(calendarSrc, /id: entry\.id/);

const pageSrc = readSrc(
  "src/workspaces/owner/calendar/WholeCakeCalendarPage.tsx",
);
assert.match(pageSrc, /buildExtraWorkspaceCapabilities/);
assert.match(pageSrc, /canAssignExtraToOrder=\{extraCapabilities\.canAssignExtraToOrder\}/);

const extraDialogSrc = readSrc(
  "src/workspaces/owner/calendar/CalendarExtraActionDialog.tsx",
);
assert.match(extraDialogSrc, /data-extra-id=\{extra\.id\}/);
assert.match(extraDialogSrc, /Assign to order/);
assert.match(
  extraDialogSrc,
  /extra\.lifecycle === "confirmed" &&\s*canAssignExtraToOrder/,
);
assert.doesNotMatch(extraDialogSrc, /collection/);

const assignDialogSrc = readSrc(
  "src/workspaces/extra/AssignExtraToOrderDialog.tsx",
);
assert.match(assignDialogSrc, /findAssignableOrderForExtraAction/);
assert.match(assignDialogSrc, /assignExtraStockToOrderAction/);
assert.match(assignDialogSrc, /extraStockId: extra\.id/);
assert.match(assignDialogSrc, /orderId: foundOrder\.id/);
assert.match(assignDialogSrc, /name="extra_stock_id"/);
assert.match(assignDialogSrc, /value=\{extra\.id\}/);
assert.match(assignDialogSrc, /searchAssignOrder\(order\.id\)/);
assert.match(assignDialogSrc, /Assign Fresh Pick/);
assert.match(assignDialogSrc, /Select an existing order/);
assert.match(assignDialogSrc, /Find order/);

const boardSrc = readSrc("src/workspaces/extra/ExtraBoard.tsx");
assert.match(boardSrc, /Assign to order/);
assert.match(boardSrc, /AssignExtraToOrderDialog/);
assert.match(boardSrc, /extra=\{assigningUnit\}/);
assert.match(boardSrc, /openAssign\(unit\)/);

const actionsSrc = readSrc("src/workspaces/extra/actions.ts");
assert.match(actionsSrc, /assign_extra_stock_to_order/);
assert.match(actionsSrc, /p_extra_stock_id: input\.extraStockId/);
assert.match(actionsSrc, /if \(!caps\.canAssignExtraToOrder\)/);
assert.match(actionsSrc, /revalidatePath\("\/owner\/calendar"\)/);

const unsold = {
  id: "extra-a",
  cake_name: "Salted Peanut",
  size_label: '6"',
  lifecycle: "confirmed" as const,
  prepared_on: "2026-09-10",
  pickup_available_from_at: "2026-09-10T07:30:00.000Z",
  pickup_through_at: "2026-09-11T10:00:00.000Z",
  library_cake_id: null,
  library_cake_size_id: null,
  sold_at: null as string | null,
};
const markerA = mapExtraStockRowToCalendarMarker(unsold);
const markerB = mapExtraStockRowToCalendarMarker({
  ...unsold,
  id: "extra-b",
});
assert.ok(markerA);
assert.ok(markerB);
assert.equal(markerA!.id, "extra-a");
assert.equal(markerB!.id, "extra-b");
assert.notEqual(markerA!.id, markerB!.id);

const soldA = mapExtraStockRowToCalendarMarker({
  ...unsold,
  sold_at: "2026-09-10T08:00:00.000Z",
});
assert.equal(soldA, null, "assigned Extra A leaves calendar independently");
assert.ok(
  mapExtraStockRowToCalendarMarker({ ...unsold, id: "extra-b" }),
  "identical Extra B remains on calendar",
);
assert.equal(
  isExtraActiveOnCalendar({
    lifecycle: "confirmed",
    preparedOn: "2026-09-10",
    pickupThroughAt: unsold.pickup_through_at,
    soldAt: "2026-09-10T08:00:00.000Z",
  }),
  false,
);

for (const role of ["bakery", "manager", "owner"] as const) {
  assert.equal(
    buildExtraWorkspaceCapabilities({ role, staffId: role }).canAssignExtraToOrder,
    true,
  );
}
for (const role of ["collection", "customer_operations"] as const) {
  assert.equal(
    buildExtraWorkspaceCapabilities({ role, staffId: role }).canAssignExtraToOrder,
    false,
    `${role} must not assign from Calendar`,
  );
}

console.log("PASS extra calendar assign-from-calendar");
