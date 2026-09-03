/**
 * Phase 5.2 — staff pickup-date closure permissions, routes, shared board.
 * Run: npx tsx scripts/test-order-availability-staff.ts
 *
 * Does not mutate production closures, capacity, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RoleCode } from "@/types/staff";
import {
  canManageLibrary,
  canMutateOrderAvailability,
  canViewOrderAvailability,
} from "@/foundation/navigation/access";
import { canAccessBakeryWorkspace } from "@/engines/bakery/capabilities";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const viewRoles: RoleCode[] = [
  "owner",
  "manager",
  "bakery",
  "customer_operations",
];
const mutateRoles: RoleCode[] = ["owner", "manager", "bakery"];
const allRoles: RoleCode[] = [
  "owner",
  "manager",
  "customer_operations",
  "bakery",
  "collection",
];

for (const role of viewRoles) {
  assert.equal(canViewOrderAvailability(role), true, `${role} can view`);
}
assert.equal(canViewOrderAvailability("collection"), false);

for (const role of mutateRoles) {
  assert.equal(canMutateOrderAvailability(role), true, `${role} can mutate`);
}
assert.equal(canMutateOrderAvailability("customer_operations"), false);
assert.equal(canMutateOrderAvailability("collection"), false);

assert.equal(canManageLibrary("bakery"), false);
assert.equal(canMutateOrderAvailability("bakery"), true);
assert.equal(canManageLibrary("customer_operations"), false);
assert.equal(canViewOrderAvailability("customer_operations"), true);

for (const role of allRoles) {
  if (canMutateOrderAvailability(role)) {
    assert.equal(canViewOrderAvailability(role), true, `${role} mutate implies view`);
  }
}

assert.equal(canAccessBakeryWorkspace("owner"), true);
assert.equal(canAccessBakeryWorkspace("manager"), true);
assert.equal(canAccessBakeryWorkspace("bakery"), true);
assert.equal(canAccessBakeryWorkspace("customer_operations"), false);
assert.equal(canAccessBakeryWorkspace("collection"), false);

const accessSrc = readSrc("src/foundation/navigation/access.ts");
assert.match(accessSrc, /export function canViewOrderAvailability/);
assert.match(accessSrc, /export function canMutateOrderAvailability/);
assert.doesNotMatch(
  accessSrc,
  /canMutateOrderAvailability[\s\S]*canManageLibrary\(/,
);

const actionSrc = readSrc(
  "src/workspaces/library/order-availability/actions.ts",
);
assert.match(actionSrc, /canMutateOrderAvailability\(staff\.role\.code\)/);
assert.match(
  actionSrc,
  /Not authorized to close or reopen pickup dates/,
);
assert.match(actionSrc, /\.from\("order_availability_overrides"\)/);
assert.match(actionSrc, /\.upsert\(/);
assert.match(actionSrc, /\.delete\(\)/);
assert.match(actionSrc, /revalidatePath\("\/bakery\/availability"\)/);
assert.match(actionSrc, /revalidatePath\("\/library\/order-availability"\)/);
assert.doesNotMatch(actionSrc, /canManageLibrary/);
assert.doesNotMatch(actionSrc, /record_order_availability_closed/);
assert.doesNotMatch(actionSrc, /production_capacity/);
assert.doesNotMatch(actionSrc, /waiting_list/);

const boardSrc = readSrc(
  "src/workspaces/library/order-availability/OrderAvailabilityBoard.tsx",
);
assert.match(boardSrc, /canMutate: boolean/);
assert.match(boardSrc, /\{canMutate \? \(/);
assert.match(boardSrc, /updateOrderAvailabilityAction/);
assert.match(boardSrc, /Close orders/);
assert.match(boardSrc, /Reopen orders/);

const screenSrc = readSrc(
  "src/workspaces/library/order-availability/OrderAvailabilityScreen.tsx",
);
assert.match(screenSrc, /hrefBase: "\/library\/order-availability" \| "\/bakery\/availability"/);
assert.match(screenSrc, /canMutate=\{canMutate\}/);
assert.match(screenSrc, /OrderAvailabilityHistory/);
assert.doesNotMatch(screenSrc, /production_capacity/);

const libraryPageSrc = readSrc(
  "src/app/(app)/library/order-availability/page.tsx",
);
assert.match(libraryPageSrc, /canViewOrderAvailability/);
assert.match(libraryPageSrc, /canMutateOrderAvailability/);
assert.match(libraryPageSrc, /hrefBase="\/library\/order-availability"/);
assert.match(libraryPageSrc, /title="Order Availability"/);

const bakeryPageSrc = readSrc(
  "src/app/(app)/bakery/availability/page.tsx",
);
assert.match(bakeryPageSrc, /canAccessBakeryWorkspace/);
assert.match(bakeryPageSrc, /canViewOrderAvailability/);
assert.match(bakeryPageSrc, /canMutateOrderAvailability/);
assert.match(bakeryPageSrc, /hrefBase="\/bakery\/availability"/);
assert.match(bakeryPageSrc, /active="availability"/);
assert.match(bakeryPageSrc, /OrderAvailabilityScreen/);
assert.doesNotMatch(bakeryPageSrc, /production_capacity/);

const bakeryLayoutSrc = readSrc("src/app/(app)/bakery/layout.tsx");
assert.match(bakeryLayoutSrc, /canAccessBakeryWorkspace/);
assert.doesNotMatch(bakeryLayoutSrc, /customer_operations/);

const bakeryNavSrc = readSrc("src/workspaces/bakery/BakeryWorkspaceNav.tsx");
assert.match(bakeryNavSrc, /href="\/bakery"/);
assert.match(bakeryNavSrc, /href="\/bakery\/availability"/);
assert.match(bakeryNavSrc, /href="\/bakery\/extra"/);
assert.match(bakeryNavSrc, /Availability/);
assert.match(bakeryNavSrc, /Production/);

const historySrc = readSrc(
  "src/workspaces/library/order-availability/OrderAvailabilityHistory.tsx",
);
assert.match(historySrc, /Recent closures/);
assert.doesNotMatch(historySrc, /event\.id/);
assert.doesNotMatch(historySrc, /actor_staff_id/);
assert.doesNotMatch(historySrc, /Owner note/);

const queriesSrc = readSrc(
  "src/workspaces/library/order-availability/queries.ts",
);
assert.match(queriesSrc, /order_availability_override_events/);
assert.match(queriesSrc, /listRecentOrderAvailabilityEvents/);
assert.match(
  queriesSrc,
  /select\("pickup_date, action, actor_staff_id, created_at"\)/,
);
assert.doesNotMatch(queriesSrc, /production_capacity/);

const guestFormSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(guestFormSrc, /ORDERS_CLOSED_CUSTOMER_LABEL/);
assert.doesNotMatch(guestFormSrc, /Owner note/);
assert.doesNotMatch(guestFormSrc, /canMutateOrderAvailability/);

const checkoutActionsSrc = readSrc(
  "src/workspaces/storefront/checkout/actions.ts",
);
assert.match(checkoutActionsSrc, /isPickupOrdersClosed/);
assert.doesNotMatch(checkoutActionsSrc, /canMutateOrderAvailability/);

console.log("PASS order availability staff");
