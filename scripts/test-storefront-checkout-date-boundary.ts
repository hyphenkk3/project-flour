/**
 * Checkout pickup calendar is bounded by the latest published monthly catalogue
 * and Whole Cake earliest date (Singapore today + 2 calendar days).
 * Run: npx tsx scripts/test-storefront-checkout-date-boundary.ts
 *
 * Does not mutate live catalogues, cakes, or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  clampCustomerPickupWindow,
  latestOrderableCataloguePickupEnd,
  orderableMonthlyCatalogues,
} from "@/engines/menu/customer-browse";
import { lastDayOfBusinessMonth } from "@/lib/dates";
import { unpublishedCataloguePreorderMessage } from "@/workspaces/storefront/catalog/queries";
import {
  WHOLE_CAKE_MIN_LEAD_CALENDAR_DAYS,
  earliestPickupDateYmd,
} from "@/engines/business-calendar/pickup-slots";

assert.equal(WHOLE_CAKE_MIN_LEAD_CALENDAR_DAYS, 2);

function maySelectWholeCakeDate(ymd: string, now: Date): boolean {
  return ymd >= earliestPickupDateYmd(now);
}

const sg19AugNoon = new Date("2026-08-19T04:00:00.000Z");
assert.equal(earliestPickupDateYmd(sg19AugNoon), "2026-08-21");
assert.equal(maySelectWholeCakeDate("2026-08-20", sg19AugNoon), false);
assert.equal(maySelectWholeCakeDate("2026-08-21", sg19AugNoon), true);

const sg20AugNoon = new Date("2026-08-20T04:00:00.000Z");
assert.equal(earliestPickupDateYmd(sg20AugNoon), "2026-08-22");
assert.equal(maySelectWholeCakeDate("2026-08-21", sg20AugNoon), false);
assert.equal(maySelectWholeCakeDate("2026-08-22", sg20AugNoon), true);

assert.equal(
  earliestPickupDateYmd(new Date("2026-08-19T15:59:59.000Z")),
  "2026-08-21",
  "still 19 Aug Singapore just before midnight",
);
assert.equal(
  earliestPickupDateYmd(new Date("2026-08-19T16:00:00.000Z")),
  "2026-08-22",
  "rolls to 22 Aug after Singapore midnight 20 Aug",
);

assert.equal(
  earliestPickupDateYmd(new Date("2026-08-31T04:00:00.000Z")),
  "2026-09-02",
);
assert.equal(
  earliestPickupDateYmd(new Date("2026-12-31T04:00:00.000Z")),
  "2027-01-02",
);

const pickupSlotsSrc = readSrc(
  "src/engines/business-calendar/pickup-slots.ts",
);
assert.match(
  pickupSlotsSrc,
  /addBusinessCalendarDays\(todaySg, WHOLE_CAKE_MIN_LEAD_CALENDAR_DAYS\)/,
);
assert.doesNotMatch(
  pickupSlotsSrc,
  /addBusinessCalendarDays\(todaySg, 1\)/,
);

const rpcSrc = readSrc(
  "supabase/migrations/20260818210000_whole_cake_customer_fulfilment.sql",
);
assert.match(
  rpcSrc,
  /timezone\('Asia\/Singapore', now\(\)\)::date \+ 2/,
);
assert.doesNotMatch(
  rpcSrc,
  /timezone\('Asia\/Singapore', now\(\)\)::date \+ 1/,
);

const slotFieldsSrc = readSrc("src/components/ui/PickupSlotFields.tsx");
assert.match(slotFieldsSrc, /earliestPickupDateYmd/);

const checkoutFormSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(checkoutFormSrc, /earliestPickupDateYmd/);

const checkoutActionsSrc = readSrc(
  "src/workspaces/storefront/checkout/actions.ts",
);
assert.match(checkoutActionsSrc, /earliestPickupDateYmd/);
assert.match(checkoutActionsSrc, /submit_guest_preorder/);

const dineInHoursSrc = readSrc("src/engines/business-calendar/dine-in-hours.ts");
assert.match(dineInHoursSrc, /earliestPickupDateYmd/);

const deliveryHoursSrc = readSrc(
  "src/engines/business-calendar/delivery-hours.ts",
);
assert.match(deliveryHoursSrc, /earliestPickupDateYmd/);

const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
assert.doesNotMatch(extraFormSrc, /earliestPickupDateYmd/);
assert.doesNotMatch(extraFormSrc, /WHOLE_CAKE_MIN_LEAD_CALENDAR_DAYS/);

const extraActionsSrc = readSrc(
  "src/workspaces/storefront/extra/actions.ts",
);
assert.doesNotMatch(extraActionsSrc, /earliestPickupDateYmd/);
assert.doesNotMatch(extraActionsSrc, /submit_guest_preorder/);

console.log("PASS whole-cake 2-day minimum date");

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

assert.equal(lastDayOfBusinessMonth("2026-08-01"), "2026-08-31");
assert.equal(lastDayOfBusinessMonth("2026-09"), "2026-09-30");
assert.equal(lastDayOfBusinessMonth("2026-02"), "2026-02-28");

const todayYm = "2026-08";
const published = orderableMonthlyCatalogues(
  [
    {
      id: "aug",
      status: "active",
      purpose: "monthly",
      month: "2026-08-01",
    },
    {
      id: "sep",
      status: "active",
      purpose: "monthly",
      month: "2026-09-01",
    },
    {
      id: "oct-draft",
      status: "draft",
      purpose: "monthly",
      month: "2026-10-01",
    },
  ],
  todayYm,
);
assert.deepEqual(
  published.map((row) => row.id),
  ["aug", "sep"],
);
assert.equal(
  latestOrderableCataloguePickupEnd(published.map((row) => row.month ?? "")),
  "2026-09-30",
);
assert.deepEqual(
  clampCustomerPickupWindow("2026-08-26", "2026-08-01", "2026-08-31"),
  { min: "2026-08-26", max: "2026-08-31" },
);
assert.deepEqual(
  clampCustomerPickupWindow("2026-08-26", "2026-09-01", "2026-09-30"),
  { min: "2026-09-01", max: "2026-09-30" },
);

assert.equal(
  unpublishedCataloguePreorderMessage("2026-08-31"),
  "August 2026 catalogue is not yet available for preorder.",
);
assert.equal(
  unpublishedCataloguePreorderMessage("2026-09-01"),
  "September 2026 catalogue is not yet available for preorder.",
);
assert.equal(
  unpublishedCataloguePreorderMessage("2026-10-01"),
  "October 2026 catalogue is not yet available for preorder.",
);

const fieldsSrc = readSrc("src/components/ui/PickupSlotFields.tsx");
assert.match(fieldsSrc, /maxDate/);
assert.match(fieldsSrc, /minDate/);
assert.match(fieldsSrc, /max=\{maxDate/);
assert.match(fieldsSrc, /min=\{minDate\}/);

const checkoutPageSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontCheckoutPage.tsx",
);
assert.match(checkoutPageSrc, /latestOrderableCataloguePickupEnd/);
assert.match(checkoutPageSrc, /listOrderableMonthlyCatalogues/);
assert.match(checkoutPageSrc, /resolveCheckoutPickupScope/);
assert.match(checkoutPageSrc, /pickupScopeFrom/);
assert.match(checkoutPageSrc, /pickupScopeConstrainsBounds/);
assert.doesNotMatch(checkoutPageSrc, /addBusinessCalendarDays\(fromDate, 120\)/);
assert.doesNotMatch(checkoutPageSrc, /collection_id/);

const formSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
assert.match(formSrc, /minPickupDate/);
assert.match(formSrc, /effectivePickupBounds/);
assert.match(formSrc, /resolveCartPickupDateBounds/);
assert.match(
  formSrc,
  /Please choose a date in a published catalogue/,
);
assert.match(formSrc, /loadCheckoutPickupOffer/);

const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
assert.match(actionsSrc, /resolveCartPickupDateBounds/);
assert.match(actionsSrc, /getStorefrontCollectionForPickupDate/);
assert.match(actionsSrc, /unpublishedCataloguePreorderMessage/);
assert.doesNotMatch(actionsSrc, /rpcArgs\.p_collection_id/);
assert.doesNotMatch(actionsSrc, /formData\.get\("collection_id"\)/);
assert.doesNotMatch(actionsSrc, /getCurrentCollection/);

const ownerFieldsSrc = readSrc(
  "src/workspaces/owner/orders/OrderFulfilmentCreateFields.tsx",
);
assert.doesNotMatch(ownerFieldsSrc, /maxPickupDate/);
assert.doesNotMatch(ownerFieldsSrc, /latestOrderableCataloguePickupEnd/);

console.log("PASS storefront checkout date boundary");
