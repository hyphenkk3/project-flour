/**
 * Shared guest success recap loader uses orders.customer_notes, not orders.notes.
 * Selecting `notes` returns PostgREST 42703 and hides Save Order Details even
 * when wb_guest_preorder_receipt authorizes the just-submitted order.
 * Run: npx tsx scripts/test-guest-preorder-receipt-loader.ts
 *
 * Static only. Does not mutate orders or extras.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  guestPreorderReceiptAuthorized,
  receiptCookieSecure,
} from "@/workspaces/storefront/checkout/receipt";
import { calculateCommercialSubtotal } from "@/engines/orders/totals";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const receiptSrc = readSrc("src/workspaces/storefront/checkout/receipt.ts");
const successSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontSuccessPage.tsx",
);
const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
const checkoutActionsSrc = readSrc(
  "src/workspaces/storefront/checkout/actions.ts",
);

assert.match(receiptSrc, /customer_notes,/);
assert.match(receiptSrc, /customer_notes \?\? ""/);
assert.match(receiptSrc, /created_at,/);
assert.match(receiptSrc, /placedAt:/);
assert.doesNotMatch(receiptSrc, /^\s+notes,$/m);
assert.doesNotMatch(receiptSrc, /\.notes \?\? ""/);
assert.match(receiptSrc, /order_items \(/);
assert.match(receiptSrc, /size_label/);
assert.match(receiptSrc, /unit_price/);
assert.match(receiptSrc, /order_paid_addons \(/);
assert.match(receiptSrc, /order_complimentary_items \(/);
assert.match(receiptSrc, /fulfilment_method/);
assert.match(receiptSrc, /extra_stock_id/);
assert.match(receiptSrc, /guestPreorderReceiptAuthorized/);
assert.match(receiptSrc, /GUEST_PREORDER_RECEIPT_COOKIE = "wb_guest_preorder_receipt"/);
assert.match(receiptSrc, /path: "\/order"/);
assert.match(receiptSrc, /httpOnly: true/);
assert.match(receiptSrc, /sameSite: "lax"/);
assert.match(receiptSrc, /\.is\("customer_id", null\)/);
assert.match(receiptSrc, /calculateCommercialSubtotal/);

assert.equal(guestPreorderReceiptAuthorized("", "abc"), false);
assert.equal(guestPreorderReceiptAuthorized("a", null), false);
assert.equal(guestPreorderReceiptAuthorized("order-1", "order-2"), false);
assert.equal(guestPreorderReceiptAuthorized("order-1", "order-1"), true);

assert.equal(receiptCookieSecure("https"), true);
assert.equal(receiptCookieSecure("https, http"), true);
assert.equal(receiptCookieSecure("http"), false);
assert.equal(receiptCookieSecure(null), false);
assert.equal(receiptCookieSecure(""), false);
assert.match(receiptSrc, /receiptCookieSecure/);
assert.match(receiptSrc, /x-forwarded-proto/);
assert.doesNotMatch(
  receiptSrc,
  /secure: process\.env\.NODE_ENV === "production"/,
);

assert.equal(
  calculateCommercialSubtotal({
    items: [{ unitPrice: 135, quantity: 1 }],
    paidAddons: [{ unitPrice: 3, quantity: 1 }],
  }),
  138,
);

assert.match(successSrc, /getGuestPreorderReceipt/);
assert.match(successSrc, /receipt \? <SaveOrderDetailsButton receipt=\{receipt\} \/>/);
assert.doesNotMatch(successSrc, /receipt && !isFreshPick/);
assert.match(successSrc, /receipt\.items\.map/);
assert.match(successSrc, /receipt\.paidAddons\.map/);
assert.match(successSrc, /receipt\.notes/);
assert.match(successSrc, /formatRm\(receipt\.total\)/);
assert.match(successSrc, /FRESH_PICKS_SUCCESS_FLOW/);

assert.match(extraActionsSrc, /setGuestPreorderReceiptCookie/);
assert.match(checkoutActionsSrc, /setGuestPreorderReceiptCookie/);

console.log("PASS guest preorder receipt loader uses customer_notes");
