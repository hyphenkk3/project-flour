/**
 * Order availability (closed pickup dates) — overlay, SQL contract, UI copy.
 * Run: npx tsx scripts/test-order-availability.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  customerMaySelectPickupDate,
  customerPickupSlotsForDate,
  isPickupOrdersClosed,
  orderAvailabilityMonthDays,
  parseOrderAvailabilityMonth,
  shiftOrderAvailabilityMonth,
} from "@/engines/business-calendar/order-availability";
import {
  getPickupSlotsForDate,
  isValidPickupSlot,
} from "@/engines/business-calendar/pickup-slots";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const migrationSrc = readSrc(
  "supabase/migrations/20260816190000_order_availability.sql",
);
const boardSrc = readSrc(
  "src/workspaces/library/order-availability/OrderAvailabilityBoard.tsx",
);
const pageSrc = readSrc(
  "src/app/(app)/library/order-availability/page.tsx",
);
const navSrc = readSrc("src/workspaces/library/LibraryNav.tsx");
const pickupFieldsSrc = readSrc("src/components/ui/PickupSlotFields.tsx");
const guestFormSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
const ownerFieldsSrc = readSrc("src/components/ui/OwnerPickupFields.tsx");
const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
const libraryActionsSrc = readSrc(
  "src/workspaces/library/order-availability/actions.ts",
);
const scheduleSrc = readSrc(
  "src/engines/business-calendar/pickup-schedule.ts",
);

assert.match(migrationSrc, /create table if not exists public\.order_availability_overrides/);
assert.match(migrationSrc, /check \(closed = true\)/);
assert.match(migrationSrc, /is_pickup_orders_closed/);
assert.match(migrationSrc, /list_closed_pickup_order_dates/);
assert.match(migrationSrc, /Orders are closed for that pickup date\./);
assert.match(migrationSrc, /if public\.is_pickup_orders_closed\(p_date\) then/);
assert.match(migrationSrc, /language plpgsql\s+stable/s);
assert.match(migrationSrc, /revoke all on table public\.order_availability_overrides from anon/);
assert.match(migrationSrc, /to authenticated/);
assert.doesNotMatch(migrationSrc, /grant .*order_availability_overrides.*anon/i);
assert.doesNotMatch(migrationSrc, /insert into public\.order_availability_overrides/);
assert.doesNotMatch(
  migrationSrc,
  /create table if not exists public\.pickup_date_overrides/,
);
assert.match(
  migrationSrc,
  /select o\.pickup_date\s+from public\.order_availability_overrides/s,
);
assert.doesNotMatch(
  migrationSrc.replace(
    /comment on column public\.order_availability_overrides\.note[\s\S]*?;/,
    "",
  ),
  /list_closed_pickup_order_dates[\s\S]*o\.note/,
);

assert.match(boardSrc, /Order Availability|CLOSED — Orders closed/);
assert.match(boardSrc, /Close orders/);
assert.match(boardSrc, /Reopen orders/);
assert.match(boardSrc, /canMutate/);
assert.match(pageSrc, /title="Order Availability"/);
assert.match(pageSrc, /OrderAvailabilityScreen/);
assert.doesNotMatch(pageSrc, /Catalogue Availability/);
assert.match(navSrc, /Order availability/);
assert.match(pickupFieldsSrc, /closedDates/);
assert.match(pickupFieldsSrc, /customerPickupSlotsForDate/);
assert.match(pickupFieldsSrc, /ORDERS_CLOSED_CUSTOMER_LABEL/);
assert.match(guestFormSrc, /closedDates/);
assert.match(guestFormSrc, /ORDERS_CLOSED_CUSTOMER_LABEL/);
assert.doesNotMatch(guestFormSrc, /Owner note/);
assert.doesNotMatch(ownerFieldsSrc, /closedDates/);
assert.match(actionsSrc, /isPickupOrdersClosed/);
assert.match(actionsSrc, /ORDERS_CLOSED_RPC_MESSAGE/);
assert.match(libraryActionsSrc, /canMutateOrderAvailability/);
assert.match(libraryActionsSrc, /Not authorized to close or reopen pickup dates/);
assert.match(libraryActionsSrc, /intent === "reopen"/);
assert.doesNotMatch(libraryActionsSrc, /canManageLibrary/);
assert.doesNotMatch(libraryActionsSrc, /requireLibraryStaff/);
assert.doesNotMatch(scheduleSrc, /order_availability_overrides/);
assert.doesNotMatch(libraryActionsSrc, /collection_cakes/);
assert.doesNotMatch(libraryActionsSrc, /library_cakes/);

const thu = "2026-09-17";
assert.equal(new Date(2026, 8, 17).getDay(), 4, "17 Sep 2026 is Thursday");
assert.equal(isValidPickupSlot(thu, "15:00"), true);
assert.equal(isValidPickupSlot(thu, "16:00"), true);
assert.equal(isValidPickupSlot(thu, "18:00"), false);
assert.ok(getPickupSlotsForDate(thu).some((slot) => slot.value === "15:00"));

assert.equal(isPickupOrdersClosed(thu, ["2026-09-17"]), true);
assert.equal(isPickupOrdersClosed("2026-09-16", ["2026-09-17"]), false);
assert.deepEqual(customerPickupSlotsForDate(thu, ["2026-09-17"]), []);
assert.ok(
  customerPickupSlotsForDate("2026-09-16", ["2026-09-17"]).some(
    (slot) => slot.value === "15:00",
  ),
);
assert.equal(
  customerMaySelectPickupDate(thu, ["2026-09-17"], "2026-09-01"),
  false,
);
assert.equal(
  customerMaySelectPickupDate("2026-09-16", ["2026-09-17"], "2026-09-01"),
  true,
);
assert.equal(
  customerMaySelectPickupDate("2026-09-18", ["2026-09-17"], "2026-09-01"),
  true,
);
assert.ok(
  getPickupSlotsForDate(thu).length > 0,
  "weekly slots remain for staff on an order-closed date",
);

assert.equal(parseOrderAvailabilityMonth("2026-12", "2026-08-16"), "2026-12");
assert.equal(parseOrderAvailabilityMonth("2027-02", "2026-08-16"), "2027-02");
assert.equal(
  parseOrderAvailabilityMonth("September", "2026-11-03"),
  "2026-11",
);
assert.equal(parseOrderAvailabilityMonth(null, "2026-11-03"), "2026-11");
assert.equal(shiftOrderAvailabilityMonth("2026-12", 1), "2027-01");
assert.equal(shiftOrderAvailabilityMonth("2026-01", -1), "2025-12");
assert.equal(orderAvailabilityMonthDays("2026-09").length, 30);
assert.equal(orderAvailabilityMonthDays("2026-09")[0], "2026-09-01");
assert.equal(orderAvailabilityMonthDays("2026-09")[29], "2026-09-30");
assert.equal(orderAvailabilityMonthDays("2027-02").length, 28);
assert.equal(orderAvailabilityMonthDays("2028-02").length, 29);
assert.equal(orderAvailabilityMonthDays("2026-12").length, 31);

assert.equal(
  customerMaySelectPickupDate("2026-09-17", [], "2026-09-18"),
  false,
  "earliest pickup still applies on an otherwise open date",
);

console.log("PASS order availability (static)");
