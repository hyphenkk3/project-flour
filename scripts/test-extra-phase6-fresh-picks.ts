/**
 * Phase 6 — Fresh Picks isolation, inventory, dates, identity, success.
 * Run: npx tsx scripts/test-extra-phase6-fresh-picks.ts
 *
 * Engine + source assertions. Does not create Extra inventory or orders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isExtraAvailable } from "@/engines/extra/availability";
import {
  extraSubmitCustomerError,
  FRESH_PICKS_FIXED_DATES_NOTE,
  FRESH_PICKS_NAME_HELP,
  FRESH_PICKS_ORDER_CTA,
  FRESH_PICKS_SOLD_OUT,
  FRESH_PICKS_SOLD_OUT_MESSAGE,
  FRESH_PICKS_SUCCESS_CONTACT,
  FRESH_PICKS_SUCCESS_FLOW,
  FRESH_PICKS_SUCCESS_PAYMENT,
  FRESH_PICKS_SUCCESS_TITLE,
  FRESH_PICKS_UNAVAILABLE_BODY,
  FRESH_PICKS_WHATSAPP_NOTE,
  freshPickAvailabilityLabel,
  isPublishedFreshPick,
  selectCustomerFreshPickOfferings,
} from "@/engines/extra/customer-fresh-picks";
import {
  extraPickupDates,
  extraPickupWindowsShareDate,
} from "@/engines/extra/extra-pickup";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
const extraQueriesSrc = readSrc("src/workspaces/storefront/extra/queries.ts");
const extraPageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontExtraPage.tsx",
);
const extraOrderPageSrc = readSrc(
  "src/workspaces/storefront/extra/StorefrontExtraOrderPage.tsx",
);
const extraPickupSrc = readSrc("src/engines/extra/extra-pickup.ts");
const extraEngineDirSrc = [
  extraPickupSrc,
  readSrc("src/engines/extra/customer-fresh-picks.ts"),
  readSrc("src/engines/extra/availability.ts"),
  readSrc("src/engines/extra/fresh-picks-eligibility.ts"),
].join("\n");
const successSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontSuccessPage.tsx",
);
const receiptSrc = readSrc("src/workspaces/storefront/checkout/receipt.ts");
const cartSrc = readSrc("src/workspaces/storefront/cart/StorefrontCartShell.tsx");
const addToOrderSrc = readSrc(
  "src/workspaces/storefront/cart/AddToOrderSheet.tsx",
);
const draftSrc = readSrc("src/workspaces/storefront/checkout/preorder-draft.ts");
const extraBoardSrc = readSrc("src/workspaces/extra/ExtraBoard.tsx");
const ownerCardSrc = readSrc("src/workspaces/owner/orders/OwnerOrderCard.tsx");
const extraRpcSrc = readSrc(
  "supabase/migrations/20260818150000_guest_extra_include_receipt_complimentary.sql",
);
const extraSoldRpcSrc = readSrc(
  "supabase/migrations/20260817140000_extra_pickup_from_order_cutoff.sql",
);

// 1. Fresh Pick can be displayed
assert.equal(freshPickAvailabilityLabel("today"), "Available today");
assert.equal(freshPickAvailabilityLabel("tomorrow"), "Available tomorrow");
assert.match(extraPageSrc, /Fresh Picks/);
assert.match(extraPageSrc, /FRESH_PICKS_ORDER_CTA/);
assert.equal(FRESH_PICKS_ORDER_CTA, "Order this Fresh Pick");
assert.equal(
  isPublishedFreshPick({
    lifecycle: "confirmed",
    pickupThroughAt: "2026-08-17T09:30:00.000Z",
    confirmedAt: "2026-08-17T01:00:00.000Z",
    soldAt: null,
    now: new Date("2026-08-17T05:00:00.000Z"),
  }),
  true,
);

// 2. Fresh Pick uses its own date configuration
assert.match(extraFormSrc, /extraOrderablePickupDates/);
assert.match(extraFormSrc, /FRESH_PICKS_FIXED_DATES_NOTE/);
assert.equal(
  FRESH_PICKS_FIXED_DATES_NOTE,
  "Pickup dates are fixed for this Fresh Pick.",
);
assert.doesNotMatch(extraPickupSrc, /preorder_days/);
assert.doesNotMatch(extraPickupSrc, /engines\/preorder/);
assert.doesNotMatch(extraFormSrc, /engines\/preorder/);
assert.doesNotMatch(extraFormSrc, /earliestPickupDateYmd/);
assert.doesNotMatch(extraFormSrc, /evaluateCollectionDate/);

const todayWindow = {
  pickupAvailableFromAt: "2026-08-17T04:00:00.000Z",
  orderCutoffAt: "2026-08-17T09:30:00.000Z",
};
assert.deepEqual(extraPickupDates(todayWindow), ["2026-08-17"]);

// 3. Normal preorder lead time does not affect Fresh Picks
assert.doesNotMatch(extraEngineDirSrc, /library_cake_sizes\.preorder_days/);
assert.doesNotMatch(extraActionsSrc, /preorder_days/);
assert.doesNotMatch(extraQueriesSrc, /preorder_days/);
assert.doesNotMatch(extraFormSrc, /formatPreorderRequirement/);

// 4. Fresh Pick uses its own inventory (unit sold_at, not production_capacity)
assert.equal(
  isExtraAvailable({
    lifecycle: "confirmed",
    pickupThroughAt: "2026-08-17T09:30:00.000Z",
    soldAt: null,
    now: new Date("2026-08-17T05:00:00.000Z"),
  }),
  true,
);
assert.equal(
  isExtraAvailable({
    lifecycle: "confirmed",
    pickupThroughAt: "2026-08-17T09:30:00.000Z",
    soldAt: "2026-08-17T05:01:00.000Z",
    now: new Date("2026-08-17T05:02:00.000Z"),
  }),
  false,
);
assert.equal(
  isPublishedFreshPick({
    lifecycle: "confirmed",
    pickupThroughAt: "2026-08-17T09:30:00.000Z",
    soldAt: "2026-08-17T05:01:00.000Z",
    now: new Date("2026-08-17T05:02:00.000Z"),
  }),
  false,
);
assert.match(extraQueriesSrc, /\.is\("sold_at", null\)/);
assert.doesNotMatch(extraQueriesSrc, /production_capacity/);
assert.doesNotMatch(extraActionsSrc, /production_capacity/);

// 5 / 6. Available can be ordered; sold-out cannot
assert.equal(FRESH_PICKS_SOLD_OUT, "Sold Out");
assert.equal(
  extraSubmitCustomerError("This Extra cake has already been sold"),
  FRESH_PICKS_SOLD_OUT_MESSAGE,
);
assert.equal(
  extraSubmitCustomerError("Extra is not available"),
  FRESH_PICKS_SOLD_OUT_MESSAGE,
);
assert.match(extraOrderPageSrc, /FRESH_PICKS_SOLD_OUT/);
assert.match(extraOrderPageSrc, /FRESH_PICKS_UNAVAILABLE_BODY/);
assert.equal(
  FRESH_PICKS_UNAVAILABLE_BODY,
  "This Fresh Pick is no longer available to order.",
);
assert.doesNotMatch(extraOrderPageSrc, /Extra cake unavailable/);
assert.doesNotMatch(extraOrderPageSrc, /stock = 0/);
assert.doesNotMatch(extraPageSrc, /Fully Booked/);
assert.doesNotMatch(extraFormSrc, /Fully Booked/);
assert.doesNotMatch(extraOrderPageSrc, /Fully Booked/);

// 7. Quantity cannot exceed available inventory (one Extra unit = qty 1)
assert.doesNotMatch(extraFormSrc, /name="quantity"/);
assert.doesNotMatch(extraFormSrc, /htmlFor="quantity"/);
assert.match(extraRpcSrc, /quantity,\s*\n\s*unit_price/);
assert.match(extraRpcSrc, /1,\s*\n\s*coalesce\(size_row\.price, 0\)/);

// 8. Stale client inventory cannot oversell
assert.match(extraSoldRpcSrc, /for update/);
assert.match(extraRpcSrc, /for update/);
assert.match(extraRpcSrc, /and e\.sold_at is null/);
assert.match(extraRpcSrc, /This Extra cake has already been sold/);
assert.match(extraActionsSrc, /extraSubmitCustomerError/);
assert.match(extraActionsSrc, /getStorefrontExtraById/);

// Pickup-window errors stay pickup-window errors
assert.equal(
  extraSubmitCustomerError("Please choose a valid pickup time for that date."),
  "Please choose a valid pickup time for that date.",
);

// 9. Multiple Fresh Picks: one Extra unit per order; same cake collapses on listing
assert.equal(
  selectCustomerFreshPickOfferings([
    {
      id: "a",
      cakeName: "Pandan",
      sizeLabel: '6"',
      libraryCakeId: "cake-p",
      libraryCakeSizeId: "size-p",
    },
    {
      id: "b",
      cakeName: "Pandan",
      sizeLabel: '6"',
      libraryCakeId: "cake-p",
      libraryCakeSizeId: "size-p",
    },
  ]).length,
  1,
);
assert.equal(
  selectCustomerFreshPickOfferings([
    {
      id: "a",
      cakeName: "Pandan",
      sizeLabel: '6"',
      libraryCakeId: "cake-p",
      libraryCakeSizeId: "size-p",
    },
    {
      id: "c",
      cakeName: "Amour",
      sizeLabel: '6"',
      libraryCakeId: "cake-a",
      libraryCakeSizeId: "size-a",
    },
  ]).length,
  2,
);
assert.match(extraFormSrc, /name="extra_stock_id"/);
assert.doesNotMatch(extraFormSrc, /extra_stock_ids/);
assert.doesNotMatch(extraFormSrc, /whitebird-preorder-draft-v1/);

// 10. Different fixed dates cannot be silently combined
const tomorrowWindow = {
  pickupAvailableFromAt: "2026-08-18T04:00:00.000Z",
  orderCutoffAt: "2026-08-18T09:30:00.000Z",
};
assert.equal(
  extraPickupWindowsShareDate(todayWindow, tomorrowWindow),
  false,
  "non-overlapping Extra windows do not share a collection date",
);
assert.equal(extraPickupWindowsShareDate(todayWindow, todayWindow), true);
assert.doesNotMatch(extraFormSrc, /mergeDraftItem/);
assert.doesNotMatch(extraActionsSrc, /readPreorderDraft/);
assert.doesNotMatch(extraFormSrc, /writePreorderDraft/);

// 11. Fresh Picks does not enter normal preorder cart
assert.doesNotMatch(extraFormSrc, /PREORDER_DRAFT_KEY/);
assert.doesNotMatch(extraActionsSrc, /PREORDER_DRAFT_KEY/);
assert.doesNotMatch(extraPageSrc, /StorefrontCartShell/);
assert.doesNotMatch(extraPageSrc, /AddToOrderSheet/);
assert.match(draftSrc, /whitebird-preorder-draft-v1/);
assert.doesNotMatch(draftSrc, /extra_stock/);
assert.doesNotMatch(cartSrc, /extra_stock/);
assert.doesNotMatch(addToOrderSrc, /extra_stock/);
assert.doesNotMatch(addToOrderSrc, /submitGuestExtraOrder/);

// 12. Normal preorder cakes do not enter Fresh Picks cart
assert.doesNotMatch(extraFormSrc, /GuestCheckoutForm/);
assert.doesNotMatch(extraFormSrc, /submit_guest_preorder/);
assert.match(extraActionsSrc, /submit_guest_extra_order/);
assert.doesNotMatch(extraActionsSrc, /submit_guest_preorder/);

// 13 / 14. Fresh Picks does not use production_capacity or preorder capacity
assert.doesNotMatch(extraEngineDirSrc, /production_capacity/);
assert.doesNotMatch(extraEngineDirSrc, /evaluateCollectionDate/);
assert.doesNotMatch(extraEngineDirSrc, /_guest_preorder_item_fully_booked/);
assert.doesNotMatch(extraActionsSrc, /capacity-availability/);
assert.doesNotMatch(extraFormSrc, /unavailableDates/);

// 15. Fresh Picks does not use waiting lists
assert.doesNotMatch(extraEngineDirSrc, /waiting.?list/i);
assert.doesNotMatch(extraFormSrc, /Join Waiting List/);
assert.doesNotMatch(extraPageSrc, /waiting.?list/i);
assert.doesNotMatch(extraOrderPageSrc, /waiting.?list/i);
assert.doesNotMatch(extraActionsSrc, /waiting.?list/i);

// 16. Customer details follow current conventions
assert.match(extraFormSrc, /FRESH_PICKS_NAME_HELP/);
assert.match(extraFormSrc, /FRESH_PICKS_WHATSAPP_NOTE/);
assert.match(extraFormSrc, /label="WhatsApp phone"/);
assert.equal(FRESH_PICKS_NAME_HELP, "Nickname / English name and surname");
assert.equal(
  FRESH_PICKS_WHATSAPP_NOTE,
  "Please ensure the WhatsApp number is correct as we will contact you regarding your order.",
);
assert.match(extraFormSrc, /name="customer_name"/);
assert.match(extraFormSrc, /name="phone"/);
assert.doesNotMatch(extraFormSrc, /name="surname"/);
assert.match(
  extraActionsSrc,
  /Please fill in your name and WhatsApp phone number/,
);

// 17. Server submission revalidates availability
assert.match(extraActionsSrc, /isValidExtraCustomerPickup/);
assert.match(extraActionsSrc, /getStorefrontExtraById/);
assert.match(extraRpcSrc, /stock_row\.lifecycle <> 'confirmed'/);
assert.match(extraRpcSrc, /stock_row\.sold_at is not null/);

// 18. Success / payment-pending state
assert.equal(FRESH_PICKS_SUCCESS_TITLE, "Order Received");
assert.equal(FRESH_PICKS_SUCCESS_PAYMENT, "Payment Pending");
assert.equal(
  FRESH_PICKS_SUCCESS_CONTACT,
  "Whitebird will contact you via WhatsApp.",
);
assert.equal(FRESH_PICKS_SUCCESS_FLOW, "fresh-picks");
assert.match(extraActionsSrc, /FRESH_PICKS_SUCCESS_FLOW/);
assert.match(successSrc, /isFreshPick/);
assert.match(successSrc, /FRESH_PICKS_SUCCESS_TITLE/);
assert.match(successSrc, /ClearPreorderDraftOnSuccess/);
assert.match(
  successSrc,
  /isFreshPick \? null : <ClearPreorderDraftOnSuccess/,
);
assert.match(receiptSrc, /isFreshPick/);
assert.match(receiptSrc, /extra_stock_id/);

// 19. Existing Fresh Picks staff handling remains
assert.match(extraBoardSrc, /EXTRA stock/);
assert.match(extraBoardSrc, /Sold Extra cakes leave Fresh Picks immediately/);
assert.match(ownerCardSrc, /extraStockId \? " · Fresh Picks"/);
assert.doesNotMatch(extraBoardSrc, /production_capacity/);
assert.doesNotMatch(extraBoardSrc, /AvailabilityOverview/);

// 20. Isolation from preorder cart draft key
assert.doesNotMatch(extraFormSrc, /whitebird-preorder-draft-changed/);

assert.doesNotMatch(extraPageSrc, /units available/i);

console.log("PASS Phase 6 Fresh Picks isolation / inventory / success");
