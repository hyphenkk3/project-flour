/**
 * Phase 5.3 — production capacity management + confirmed-order floor (static).
 * Run: npx tsx scripts/test-production-capacity.ts
 *
 * Does not mutate production capacity, orders, or closures.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PRODUCTION_CAPACITY_FLOOR_ERROR,
  PRODUCTION_CAPACITY_FLOOR_ORDER_STATUSES,
  PRODUCTION_CAPACITY_REMOVED_EVENT_NOTE,
  committedQuantityForCapacityScope,
  evaluateProductionCapacityFloor,
  orderItemCountsTowardCapacityFloor,
  productionCapacityFloorError,
} from "@/engines/orders/production-capacity";
import {
  canMutateOrderAvailability,
  canViewOrderAvailability,
} from "@/foundation/navigation/access";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const cakeA = "cake-a";
const size6 = "size-6";
const size8 = "size-8";
const scopeCakeWide = {
  pickupDate: "2026-09-15",
  cakeId: cakeA,
  sizeId: null,
  collectionId: null,
};
const scopeSize6 = { ...scopeCakeWide, sizeId: size6 };
const scopeCollection = {
  ...scopeCakeWide,
  collectionId: "col-1",
};

const lines = [
  {
    orderStatus: "paid",
    orderPickupDate: "2026-09-15",
    orderCollectionId: null,
    itemCakeId: cakeA,
    itemSizeId: size6,
    quantity: 2,
  },
  {
    orderStatus: "awaiting_payment",
    orderPickupDate: "2026-09-15",
    orderCollectionId: null,
    itemCakeId: cakeA,
    itemSizeId: size8,
    quantity: 3,
  },
  {
    orderStatus: "submitted",
    orderPickupDate: "2026-09-15",
    orderCollectionId: null,
    itemCakeId: cakeA,
    itemSizeId: size6,
    quantity: 9,
  },
  {
    orderStatus: "pending_confirmation",
    orderPickupDate: "2026-09-15",
    orderCollectionId: null,
    itemCakeId: cakeA,
    itemSizeId: size6,
    quantity: 4,
  },
  {
    orderStatus: "cancelled",
    orderPickupDate: "2026-09-15",
    orderCollectionId: null,
    itemCakeId: cakeA,
    itemSizeId: size6,
    quantity: 7,
  },
  {
    orderStatus: "paid",
    orderPickupDate: "2026-09-16",
    orderCollectionId: null,
    itemCakeId: cakeA,
    itemSizeId: size6,
    quantity: 10,
  },
  {
    orderStatus: "confirmed",
    orderPickupDate: "2026-09-15",
    orderCollectionId: "col-1",
    itemCakeId: cakeA,
    itemSizeId: size6,
    quantity: 1,
  },
];

assert.deepEqual(
  [...PRODUCTION_CAPACITY_FLOOR_ORDER_STATUSES],
  ["confirmed", "awaiting_payment", "paid"],
);

// A. No capacity row = unrestricted is a product rule (engine + SQL comments).
assert.equal(evaluateProductionCapacityFloor({ nextQuantity: null, committedQuantity: 5 }).ok, true);

// B/C/D create/update including 0
assert.equal(evaluateProductionCapacityFloor({ nextQuantity: 0, committedQuantity: 0 }).ok, true);
assert.equal(evaluateProductionCapacityFloor({ nextQuantity: 8, committedQuantity: 0 }).ok, true);

// E floor fail
const tooLow = evaluateProductionCapacityFloor({ nextQuantity: 4, committedQuantity: 5 });
assert.equal(tooLow.ok, false);
if (!tooLow.ok) assert.equal(tooLow.committedQuantity, 5);

// F equal allowed
assert.equal(evaluateProductionCapacityFloor({ nextQuantity: 5, committedQuantity: 5 }).ok, true);

// G/H above / increase
assert.equal(evaluateProductionCapacityFloor({ nextQuantity: 6, committedQuantity: 5 }).ok, true);

// I size-specific floor counts only matching size
assert.equal(committedQuantityForCapacityScope(lines, scopeSize6), 3);
assert.equal(
  orderItemCountsTowardCapacityFloor({
    orderStatus: "paid",
    orderPickupDate: "2026-09-15",
    orderCollectionId: null,
    itemCakeId: cakeA,
    itemSizeId: size8,
    scope: scopeSize6,
  }),
  false,
);

// J cake-wide counts both sizes (confirmed only)
assert.equal(committedQuantityForCapacityScope(lines, scopeCakeWide), 6);

// K collection-specific follows existing scope (null collection on cake-wide
// still counts catalogue orders; scoped row only counts that catalogue)
assert.equal(committedQuantityForCapacityScope(lines, scopeCollection), 1);
assert.equal(
  orderItemCountsTowardCapacityFloor({
    orderStatus: "paid",
    orderPickupDate: "2026-09-15",
    orderCollectionId: null,
    itemCakeId: cakeA,
    itemSizeId: size6,
    scope: scopeCollection,
  }),
  false,
);

assert.match(
  productionCapacityFloorError(5),
  /Capacity cannot be reduced below the number of confirmed orders already committed to this date and cake/,
);
assert.match(productionCapacityFloorError(5), /Confirmed quantity: 5/);
assert.equal(
  PRODUCTION_CAPACITY_FLOOR_ERROR,
  "Capacity cannot be reduced below the number of confirmed orders already committed to this date and cake.",
);

// L/M permissions
assert.equal(canMutateOrderAvailability("customer_operations"), false);
assert.equal(canViewOrderAvailability("customer_operations"), true);
assert.equal(canMutateOrderAvailability("owner"), true);
assert.equal(canMutateOrderAvailability("manager"), true);
assert.equal(canMutateOrderAvailability("bakery"), true);
assert.equal(canMutateOrderAvailability("collection"), false);

const sql = readSrc(
  "supabase/migrations/20260903100000_set_production_capacity.sql",
);
assert.match(sql, /create or replace function public\.set_production_capacity/);
assert.match(sql, /create or replace function public\.production_capacity_committed_quantity/);
assert.match(sql, /for update of o/);
assert.match(sql, /pg_advisory_xact_lock/);
assert.match(sql, /'confirmed'::public\.order_status/);
assert.match(sql, /'awaiting_payment'::public\.order_status/);
assert.match(sql, /'paid'::public\.order_status/);
assert.doesNotMatch(sql, /'submitted'::public\.order_status/);
assert.doesNotMatch(sql, /'pending_confirmation'::public\.order_status/);
assert.doesNotMatch(sql, /'cancelled'::public\.order_status/);
assert.match(sql, /insert into public\.production_capacity_events/);
assert.match(sql, /Removed \(unrestricted\)/);
assert.match(sql, /Not authorized to change production capacity/);
assert.match(sql, /v_role is distinct from 'bakery'/);
assert.match(sql, /p_capacity_quantity is null/);
assert.doesNotMatch(sql, /from public\.production_capacity_holds/);
assert.doesNotMatch(sql, /waiting_list_requests/);
assert.match(
  sql,
  /Capacity cannot be reduced below the number of confirmed orders already committed to this date and cake/,
);

const phase3Sql = readSrc(
  "supabase/migrations/20260902230000_phase3_preorder_date_engine.sql",
);
assert.match(phase3Sql, /_guest_preorder_item_fully_booked/);
assert.match(phase3Sql, /Fully Booked/);
assert.match(phase3Sql, /'submitted'/);
assert.match(phase3Sql, /'pending_confirmation'/);
assert.doesNotMatch(phase3Sql, /set_production_capacity/);

const actionSrc = readSrc(
  "src/workspaces/library/order-availability/capacity/actions.ts",
);
assert.match(actionSrc, /canMutateOrderAvailability/);
assert.match(actionSrc, /set_production_capacity/);
assert.match(actionSrc, /p_collection_id: collectionId/);
assert.match(actionSrc, /p_capacity_quantity: null/);
assert.doesNotMatch(actionSrc, /canManageLibrary/);
assert.doesNotMatch(actionSrc, /production_capacity_holds/);

const panelSrc = readSrc(
  "src/workspaces/library/order-availability/capacity/ProductionCapacityPanel.tsx",
);
assert.match(panelSrc, /Production capacity/);
assert.match(panelSrc, /canMutate/);
assert.match(panelSrc, /Confirmed/);
assert.match(panelSrc, /All sizes/);
assert.match(panelSrc, /Allow waiting list/);
assert.doesNotMatch(panelSrc, /Join Waiting List/);
assert.doesNotMatch(panelSrc, /queue_position/);

const bakeryPageSrc = readSrc(
  "src/app/(app)/bakery/availability/page.tsx",
);
assert.match(bakeryPageSrc, /ProductionCapacitySection/);
assert.match(bakeryPageSrc, /OrderAvailabilityScreen/);

const libraryPageSrc = readSrc(
  "src/app/(app)/library/order-availability/page.tsx",
);
assert.doesNotMatch(libraryPageSrc, /ProductionCapacity/);
assert.match(libraryPageSrc, /OrderAvailabilityScreen/);

const closureActionsSrc = readSrc(
  "src/workspaces/library/order-availability/actions.ts",
);
assert.doesNotMatch(closureActionsSrc, /production_capacity/);
assert.match(closureActionsSrc, /order_availability_overrides/);

const guestFormSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.doesNotMatch(guestFormSrc, /capacity_quantity/);
assert.doesNotMatch(guestFormSrc, /production_capacity/);
assert.doesNotMatch(guestFormSrc, /Confirmed quantity/);
assert.match(guestFormSrc, /ORDERS_CLOSED_CUSTOMER_LABEL/);

const checkoutActionsSrc = readSrc(
  "src/workspaces/storefront/checkout/actions.ts",
);
assert.doesNotMatch(checkoutActionsSrc, /set_production_capacity/);
assert.match(checkoutActionsSrc, /isPickupOrdersClosed/);

const storefrontQueriesSrc = readSrc(
  "src/workspaces/storefront/catalog/queries.ts",
);
assert.doesNotMatch(storefrontQueriesSrc, /production_capacity/);

const typesSrc = readSrc("src/types/storefront.ts");
assert.doesNotMatch(typesSrc, /capacity_quantity/);
assert.doesNotMatch(typesSrc, /committedQuantity/);

assert.equal(PRODUCTION_CAPACITY_REMOVED_EVENT_NOTE, "Removed (unrestricted)");

console.log("PASS production capacity");
