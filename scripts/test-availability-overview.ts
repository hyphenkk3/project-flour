/**
 * Phase 5.4 — staff availability overview (static).
 * Run: npx tsx scripts/test-availability-overview.ts
 *
 * Does not mutate production capacity, orders, or closures.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AVAILABILITY_OVERVIEW_DAY_COUNT,
  AVAILABILITY_OVERVIEW_FLOOR_ORDER_STATUSES,
  availabilityOverviewDates,
  buildAvailabilityOverviewDays,
  committedQuantityForOverviewRow,
  overviewScopeStatus,
  parseAvailabilityOverviewFrom,
  remainingCapacityQuantity,
  shiftAvailabilityOverviewFrom,
} from "@/engines/orders/availability-overview";
import { PRODUCTION_CAPACITY_FLOOR_ORDER_STATUSES } from "@/engines/orders/production-capacity";
import {
  canMutateOrderAvailability,
  canViewOrderAvailability,
} from "@/foundation/navigation/access";
import { canAccessBakeryWorkspace } from "@/engines/bakery/capabilities";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

assert.equal(AVAILABILITY_OVERVIEW_DAY_COUNT, 14);
assert.deepEqual(
  [...AVAILABILITY_OVERVIEW_FLOOR_ORDER_STATUSES],
  ["confirmed", "awaiting_payment", "paid"],
);
assert.deepEqual(
  [...AVAILABILITY_OVERVIEW_FLOOR_ORDER_STATUSES],
  [...PRODUCTION_CAPACITY_FLOOR_ORDER_STATUSES],
);

const from = "2026-09-03";
const dates = availabilityOverviewDates(from);
assert.equal(dates.length, 14);
assert.equal(dates[0], "2026-09-03");
assert.equal(dates[13], "2026-09-16");
assert.equal(shiftAvailabilityOverviewFrom(from, 1), "2026-09-17");
assert.equal(shiftAvailabilityOverviewFrom(from, -1), "2026-08-20");
assert.equal(parseAvailabilityOverviewFrom("not-a-date", from), from);
assert.equal(parseAvailabilityOverviewFrom("2026-09-10", from), "2026-09-10");
assert.deepEqual(availabilityOverviewDates("bad"), []);

const cakeA = "cake-a";
const size6 = "size-6";
const size8 = "size-8";
const lines = [
  {
    orderStatus: "paid",
    orderPickupDate: "2026-09-03",
    orderCollectionId: null,
    itemCakeId: cakeA,
    itemSizeId: size6,
    quantity: 2,
  },
  {
    orderStatus: "awaiting_payment",
    orderPickupDate: "2026-09-03",
    orderCollectionId: null,
    itemCakeId: cakeA,
    itemSizeId: size8,
    quantity: 3,
  },
  {
    orderStatus: "confirmed",
    orderPickupDate: "2026-09-03",
    orderCollectionId: "col-1",
    itemCakeId: cakeA,
    itemSizeId: size6,
    quantity: 1,
  },
  {
    orderStatus: "submitted",
    orderPickupDate: "2026-09-03",
    orderCollectionId: null,
    itemCakeId: cakeA,
    itemSizeId: size6,
    quantity: 9,
  },
  {
    orderStatus: "pending_confirmation",
    orderPickupDate: "2026-09-03",
    orderCollectionId: null,
    itemCakeId: cakeA,
    itemSizeId: size6,
    quantity: 4,
  },
  {
    orderStatus: "cancelled",
    orderPickupDate: "2026-09-03",
    orderCollectionId: null,
    itemCakeId: cakeA,
    itemSizeId: size6,
    quantity: 7,
  },
  {
    orderStatus: "completed",
    orderPickupDate: "2026-09-03",
    orderCollectionId: null,
    itemCakeId: cakeA,
    itemSizeId: size6,
    quantity: 8,
  },
  {
    orderStatus: "paid",
    orderPickupDate: "2026-09-04",
    orderCollectionId: null,
    itemCakeId: cakeA,
    itemSizeId: size6,
    quantity: 10,
  },
];

const cakeWide = {
  pickupDate: "2026-09-03",
  cakeId: cakeA,
  cakeName: "Pandan Cake",
  sizeId: null,
  sizeLabel: null,
  collectionId: null,
  collectionLabel: null,
  capacityQuantity: 10,
  committedQuantity: 0,
};
cakeWide.committedQuantity = committedQuantityForOverviewRow(lines, cakeWide);

const sizeSix = {
  ...cakeWide,
  sizeId: size6,
  sizeLabel: "6 inch",
  capacityQuantity: 4,
  committedQuantity: 0,
};
sizeSix.committedQuantity = committedQuantityForOverviewRow(lines, sizeSix);

const catalogueRow = {
  ...cakeWide,
  collectionId: "col-1",
  collectionLabel: "September",
  capacityQuantity: 2,
  committedQuantity: 0,
};
catalogueRow.committedQuantity = committedQuantityForOverviewRow(
  lines,
  catalogueRow,
);

// 1. Open date + unrestricted cake
const unrestricted = buildAvailabilityOverviewDays({
  dates: ["2026-09-03"],
  closedDates: [],
  rows: [],
});
assert.equal(unrestricted[0]?.closed, false);
assert.equal(unrestricted[0]?.unrestricted, true);
assert.equal(unrestricted[0]?.scopes.length, 0);

// 2. Open date + capacity row
const constrained = buildAvailabilityOverviewDays({
  dates: ["2026-09-03"],
  closedDates: [],
  rows: [{ ...cakeWide, committedQuantity: 6, capacityQuantity: 10 }],
});
assert.equal(constrained[0]?.unrestricted, false);
assert.equal(constrained[0]?.scopes[0]?.capacityQuantity, 10);
assert.equal(constrained[0]?.scopes[0]?.committedQuantity, 6);
assert.equal(constrained[0]?.scopes[0]?.remainingQuantity, 4);
assert.equal(constrained[0]?.scopes[0]?.status, "open");

// 3. Capacity below committed
assert.equal(remainingCapacityQuantity(4, 6), 0);
assert.equal(overviewScopeStatus(4, 6), "fully_booked");
const oversold = buildAvailabilityOverviewDays({
  dates: ["2026-09-03"],
  closedDates: [],
  rows: [{ ...cakeWide, capacityQuantity: 4, committedQuantity: 6 }],
});
assert.equal(oversold[0]?.scopes[0]?.remainingQuantity, 0);
assert.equal(oversold[0]?.scopes[0]?.status, "fully_booked");
assert.equal(oversold[0]?.scopes[0]?.committedQuantity, 6);

// 4. Equal -> Fully Booked
assert.equal(overviewScopeStatus(8, 8), "fully_booked");
assert.equal(remainingCapacityQuantity(8, 8), 0);

// 5. Capacity above committed
assert.equal(overviewScopeStatus(10, 6), "open");
assert.equal(remainingCapacityQuantity(10, 6), 4);

// 6. Closed date
const closed = buildAvailabilityOverviewDays({
  dates: ["2026-09-04"],
  closedDates: ["2026-09-04"],
  rows: [],
});
assert.equal(closed[0]?.closed, true);
assert.equal(closed[0]?.unrestricted, true);

// 7. Multiple dates
const multi = buildAvailabilityOverviewDays({
  dates: ["2026-09-03", "2026-09-04"],
  closedDates: ["2026-09-04"],
  rows: [{ ...cakeWide, committedQuantity: 6, capacityQuantity: 10 }],
});
assert.equal(multi.length, 2);
assert.equal(multi[0]?.closed, false);
assert.equal(multi[0]?.unrestricted, false);
assert.equal(multi[1]?.closed, true);
assert.equal(multi[1]?.unrestricted, true);

// 8. Whole-cake capacity counts both sizes (confirmed statuses only)
assert.equal(cakeWide.committedQuantity, 6);

// 9. Size-specific capacity counts only that size
assert.equal(sizeSix.committedQuantity, 3);

// 10. Rows are independent scopes (not additive); most-specific matching unchanged
const independent = buildAvailabilityOverviewDays({
  dates: ["2026-09-03"],
  closedDates: [],
  rows: [cakeWide, sizeSix],
});
assert.equal(independent[0]?.scopes.length, 2);
const wholeCakeScope = independent[0]?.scopes.find(
  (scope) => scope.sizeId === null,
);
const sizeScope = independent[0]?.scopes.find(
  (scope) => scope.sizeId === size6,
);
assert.equal(wholeCakeScope?.capacityQuantity, 10);
assert.equal(wholeCakeScope?.committedQuantity, 6);
assert.equal(wholeCakeScope?.remainingQuantity, 4);
assert.equal(sizeScope?.capacityQuantity, 4);
assert.equal(sizeScope?.committedQuantity, 3);
assert.equal(sizeScope?.remainingQuantity, 1);
const phase3Sql = readSrc(
  "supabase/migrations/20260902230000_phase3_preorder_date_engine.sql",
);
assert.match(
  phase3Sql,
  /\(c\.library_cake_size_id is not null\) desc/,
);
assert.match(
  phase3Sql,
  /\(c\.collection_id is not null\) desc/,
);

// 11–13. Floor statuses
assert.equal(
  committedQuantityForOverviewRow(lines, cakeWide),
  6,
);
assert.equal(
  committedQuantityForOverviewRow(
    lines.filter((line) => line.orderStatus === "submitted"),
    cakeWide,
  ),
  0,
);
assert.equal(
  committedQuantityForOverviewRow(
    lines.filter((line) =>
      line.orderStatus === "cancelled" || line.orderStatus === "completed",
    ),
    cakeWide,
  ),
  0,
);

// K / collection-specific existing rows follow the same scope helper
assert.equal(catalogueRow.committedQuantity, 1);

// 14. No capacity row is not Fully Booked
assert.equal(unrestricted[0]?.unrestricted, true);
assert.equal(
  unrestricted[0]?.scopes.some((scope) => scope.status === "fully_booked"),
  false,
);

// 15–16. Permissions
for (const role of [
  "owner",
  "manager",
  "bakery",
  "customer_operations",
] as const) {
  assert.equal(canViewOrderAvailability(role), true, `${role} can view`);
}
assert.equal(canViewOrderAvailability("collection"), false);
assert.equal(canMutateOrderAvailability("customer_operations"), false);
assert.equal(canAccessBakeryWorkspace("customer_operations"), false);
assert.equal(canAccessBakeryWorkspace("collection"), false);

const bakeryPageSrc = readSrc(
  "src/app/(app)/bakery/availability/page.tsx",
);
assert.match(bakeryPageSrc, /AvailabilityOverviewSection/);
assert.match(bakeryPageSrc, /canViewOrderAvailability/);
assert.match(bakeryPageSrc, /showWorkspaceLinks/);
assert.doesNotMatch(bakeryPageSrc, /set_production_capacity/);

const bakeryLayoutSrc = readSrc("src/app/(app)/bakery/layout.tsx");
assert.match(bakeryLayoutSrc, /canViewOrderAvailability/);
assert.match(bakeryLayoutSrc, /canAccessBakeryWorkspace/);

const bakeryProductionSrc = readSrc("src/app/(app)/bakery/page.tsx");
assert.match(bakeryProductionSrc, /canAccessBakeryWorkspace/);
assert.match(bakeryProductionSrc, /redirect\("\/bakery\/availability"\)/);

const bakeryExtraSrc = readSrc("src/app/(app)/bakery/extra/page.tsx");
assert.match(bakeryExtraSrc, /canAccessBakeryWorkspace/);
assert.match(bakeryExtraSrc, /redirect\("\/bakery\/availability"\)/);

const bakeryNavSrc = readSrc("src/workspaces/bakery/BakeryWorkspaceNav.tsx");
assert.match(bakeryNavSrc, /showWorkspaceLinks/);

const libraryPageSrc = readSrc(
  "src/app/(app)/library/order-availability/page.tsx",
);
assert.doesNotMatch(libraryPageSrc, /AvailabilityOverview/);
assert.doesNotMatch(libraryPageSrc, /ProductionCapacity/);

// 17. Overview has no mutation controls/actions
const panelSrc = readSrc(
  "src/workspaces/library/order-availability/overview/AvailabilityOverviewPanel.tsx",
);
assert.match(panelSrc, /Availability overview/);
assert.match(panelSrc, /Fully Booked/);
assert.match(panelSrc, /Unrestricted/);
assert.doesNotMatch(panelSrc, /saveProductionCapacityAction/);
assert.doesNotMatch(panelSrc, /removeProductionCapacityAction/);
assert.doesNotMatch(panelSrc, /updateOrderAvailabilityAction/);
assert.doesNotMatch(panelSrc, /set_production_capacity/);
assert.doesNotMatch(panelSrc, /<form/);
assert.doesNotMatch(panelSrc, /waiting_list/);

const sectionSrc = readSrc(
  "src/workspaces/library/order-availability/overview/AvailabilityOverviewSection.tsx",
);
assert.doesNotMatch(sectionSrc, /canMutate/);
assert.doesNotMatch(sectionSrc, /saveProductionCapacityAction/);

const querySrc = readSrc(
  "src/workspaces/library/order-availability/overview/queries.ts",
);
assert.match(querySrc, /committedQuantityForOverviewRow/);
assert.match(querySrc, /AVAILABILITY_OVERVIEW_FLOOR_ORDER_STATUSES/);
assert.doesNotMatch(querySrc, /set_production_capacity/);
assert.doesNotMatch(querySrc, /production_capacity_holds/);
assert.doesNotMatch(querySrc, /waiting_list/);

const engineSrc = readSrc("src/engines/orders/availability-overview.ts");
assert.match(engineSrc, /PRODUCTION_CAPACITY_FLOOR_ORDER_STATUSES/);
assert.doesNotMatch(engineSrc, /submitted/);
assert.doesNotMatch(engineSrc, /pending_confirmation/);

// 18. Customer-facing routes/data unchanged
const guestFormSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.doesNotMatch(guestFormSrc, /availability-overview/);
assert.doesNotMatch(guestFormSrc, /committedQuantity/);
assert.doesNotMatch(guestFormSrc, /capacity_quantity/);
assert.match(guestFormSrc, /ORDERS_CLOSED_CUSTOMER_LABEL/);

const checkoutActionsSrc = readSrc(
  "src/workspaces/storefront/checkout/actions.ts",
);
assert.doesNotMatch(checkoutActionsSrc, /listAvailabilityOverview/);
assert.match(checkoutActionsSrc, /isPickupOrdersClosed/);

const storefrontQueriesSrc = readSrc(
  "src/workspaces/storefront/catalog/queries.ts",
);
assert.doesNotMatch(storefrontQueriesSrc, /production_capacity/);
assert.doesNotMatch(storefrontQueriesSrc, /listAvailabilityOverview/);

const typesSrc = readSrc("src/types/storefront.ts");
assert.doesNotMatch(typesSrc, /capacity_quantity/);
assert.doesNotMatch(typesSrc, /committedQuantity/);

// 19. Waiting-list tables/logic remain untouched
assert.doesNotMatch(querySrc, /waiting_list_items/);
assert.doesNotMatch(engineSrc, /production_capacity_holds/);

// 20. Closure mutation path unchanged
const closureActionsSrc = readSrc(
  "src/workspaces/library/order-availability/actions.ts",
);
assert.match(closureActionsSrc, /order_availability_overrides/);
assert.match(closureActionsSrc, /\.upsert\(/);
assert.match(closureActionsSrc, /\.delete\(\)/);
assert.doesNotMatch(closureActionsSrc, /listAvailabilityOverview/);
assert.doesNotMatch(closureActionsSrc, /set_production_capacity/);

const capacityActionsSrc = readSrc(
  "src/workspaces/library/order-availability/capacity/actions.ts",
);
assert.match(capacityActionsSrc, /set_production_capacity/);
assert.doesNotMatch(capacityActionsSrc, /listAvailabilityOverview/);

console.log("PASS availability overview");
