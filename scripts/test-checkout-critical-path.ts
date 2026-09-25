/**
 * Phase 2B: Confirm Order critical path.
 * Parallelize independent reads and narrow voucher authorization.
 * Financial rules, apply RPC, and settlement must stay unchanged.
 * Run: npx tsx scripts/test-checkout-critical-path.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  emptyCatalogueRules,
  evaluateCatalogueVoucherEligibility,
} from "@/engines/vouchers/catalogue-voucher";
import { catalogueVoucherPreviewPayable } from "@/workspaces/storefront/offers/CatalogueVoucherAmountLines";
import { CATALOGUE_VOUCHER_ADJUSTMENT_CODE } from "@/types/catalogue-voucher";
import type {
  CatalogueEligibilityInput,
  CatalogueVoucherRecord,
} from "@/types/catalogue-voucher";
import { getEffectiveAdjustments } from "@/engines/orders/promotions";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import { guestPreorderReceiptAuthorized } from "@/workspaces/storefront/checkout/receipt";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function sliceFn(src: string, startNeedle: string, nextNeedles: string[]): string {
  const start = src.indexOf(startNeedle);
  assert.ok(start >= 0, `missing ${startNeedle}`);
  let end = src.length;
  for (const next of nextNeedles) {
    const idx = src.indexOf(next, start + startNeedle.length);
    if (idx >= 0 && idx < end) end = idx;
  }
  return src.slice(start, end);
}

const actionsSrc = readSrc("src/workspaces/storefront/checkout/actions.ts");
const voucherActionsSrc = readSrc("src/workspaces/vouchers/catalogue-actions.ts");
const voucherQueriesSrc = readSrc("src/workspaces/vouchers/catalogue-queries.ts");
const retrySrc = readSrc(
  "src/workspaces/storefront/offers/ApplySelectedCatalogueVoucher.tsx",
);
const successSrc = readSrc(
  "src/workspaces/storefront/checkout/StorefrontSuccessPage.tsx",
);
const receiptSrc = readSrc("src/workspaces/storefront/checkout/receipt.ts");
const formSrc = readSrc(
  "src/workspaces/storefront/checkout/GuestCheckoutForm.tsx",
);
const crewPreviewSrc = readSrc(
  "src/workspaces/owner/orders/PaymentRequestPreview.tsx",
);
const orderDetailsSrc = readSrc(
  "src/workspaces/storefront/checkout/order-details-card.ts",
);

const submitFn = sliceFn(actionsSrc, "async function submitGuestPreorderActionBody", [
  "\nexport async function loadCheckoutCalendarContext",
  "\nexport async function loadCheckoutPickupOffer",
]);
const applyAuthoritativeFn = sliceFn(
  voucherActionsSrc,
  "async function applyCatalogueVoucherAuthoritative",
  ["export async function listPublicCatalogueVouchersAction"],
);
const guestApplyFn = sliceFn(
  voucherActionsSrc,
  "async function applyGuestCatalogueVoucherActionTimed",
  [],
);
const applyOrderFn = sliceFn(
  voucherQueriesSrc,
  "export async function loadCatalogueApplyOrder",
  ["export function voucherRelevantToCake"],
);
const voucherForApplyFn = sliceFn(
  voucherQueriesSrc,
  "export async function getCatalogueVoucherForApply",
  ["export type CatalogueApplyOrder", "export async function loadCatalogueApplyOrder"],
);

// 1 + 2. Authoritative pre-submit validations still execute, and
// independent reads can run concurrently.
const wave1 = sliceFn(
  submitFn,
  "const [pickupClosed, hoursSnapshot, collection, supabase] = await Promise.all([",
  ["if (pickupClosed)"],
);
assert.match(wave1, /isPickupOrdersClosed\(pickupDate\)/);
assert.match(wave1, /loadOperatingHoursSnapshot\(\)/);
assert.match(wave1, /getStorefrontCollectionForPickupDate\(pickupDate\)/);
assert.match(wave1, /createClient\(\)/);
assert.match(submitFn, /if \(pickupClosed\)/);
assert.match(submitFn, /isValidPickupSlot\(pickupDate, pickupTime, hoursSnapshot\)/);
assert.match(submitFn, /unpublishedCataloguePreorderMessage\(pickupDate\)/);
assert.match(submitFn, /evaluateCollectionDate\(/);
assert.match(submitFn, /evaluateCartPickupCompatibility\(/);
assert.match(submitFn, /Cake size is not available/);
assert.match(submitFn, /loadCustomerCartDateCapacity\(/);
assert.match(submitFn, /submit_guest_preorder/);
assert.match(submitFn, /setGuestPreorderReceiptCookie\(orderId\)/);
assert.match(submitFn, /applyGuestCatalogueVoucherAction\(orderId, catalogueVoucherId\)/);

const wave2 = sliceFn(
  submitFn,
  "const [offered, liveDays, businessDate, optionCatalog] = await Promise.all([",
  ["for (const item of items)"],
);
assert.match(wave2, /listAvailableCakes\(collection.id\)/);
assert.match(wave2, /loadLivePreorderDaysBySizeId\(/);
assert.match(wave2, /loadMalaysiaPreorderBusinessDate\(supabase\)/);
assert.match(wave2, /loadCustomerPreorderOptions\(supabase, collection.id\)/);
assert.ok(
  submitFn.indexOf("const [offered, liveDays, businessDate, optionCatalog]") <
    submitFn.indexOf("loadCustomerCartDateCapacity"),
  "capacity still waits for offered cake names",
);
assert.doesNotMatch(submitFn, /getGuestPreorderReceipt\(/);
assert.doesNotMatch(
  submitFn,
  /await isPickupOrdersClosed\(pickupDate\)[\s\S]*await loadOperatingHoursSnapshot\(\)/,
);

// 3 + 4. Voucher authorization does not load the full receipt and
// still rejects unauthorized orders.
assert.doesNotMatch(guestApplyFn, /getGuestPreorderReceipt\(/);
assert.doesNotMatch(guestApplyFn, /library_cake_photos/);
assert.doesNotMatch(guestApplyFn, /complimentary/);
assert.doesNotMatch(applyOrderFn, /library_cake_photos/);
assert.doesNotMatch(applyOrderFn, /getGuestPreorderReceipt/);
assert.match(applyOrderFn, /customer_id/);
assert.match(applyOrderFn, /if \(!order \|\| order\.customer_id\) return null/);
assert.match(applyOrderFn, /order_items/);
assert.match(applyOrderFn, /order_adjustments/);
assert.match(guestApplyFn, /guestPreorderReceiptAuthorized\(orderId, cookieOrderId\)/);
assert.match(
  guestApplyFn,
  /This order is not available for voucher application\./,
);
assert.match(
  guestApplyFn,
  /if \(result\.error === "Order not found\."\)/,
);
assert.equal(guestPreorderReceiptAuthorized("order-a", "order-a"), true);
assert.equal(guestPreorderReceiptAuthorized("order-a", "order-b"), false);
assert.equal(guestPreorderReceiptAuthorized("order-a", null), false);
assert.equal(guestPreorderReceiptAuthorized("", "order-a"), false);

// 5 + 6. Eligibility unchanged; authoritative apply RPC still executes.
assert.match(applyAuthoritativeFn, /evaluateCatalogueVoucherEligibility/);
assert.match(applyAuthoritativeFn, /catalogueEligibilityInputFromOrder/);
assert.match(
  applyAuthoritativeFn,
  /apply_catalogue_voucher_to_guest_order/,
);
assert.match(applyAuthoritativeFn, /p_order_id: input\.orderId/);
assert.match(applyAuthoritativeFn, /p_voucher_id: input\.voucherId/);
assert.match(
  voucherActionsSrc,
  /Client-provided discount amounts are not accepted/,
);
assert.doesNotMatch(applyAuthoritativeFn, /\.from\("order_adjustments"\)\.insert/);
assert.match(applyAuthoritativeFn, /Promise\.all\(\[/);
assert.match(applyAuthoritativeFn, /loadCatalogueApplyOrder\(input\.orderId\)/);
assert.match(applyAuthoritativeFn, /getCatalogueVoucherForApply\(input\.voucherId\)/);
assert.match(voucherForApplyFn, /Promise\.all\(\[/);
assert.match(voucherForApplyFn, /loadCatalogueRulesForVouchers/);
assert.match(voucherForApplyFn, /library_vouchers/);

// 7 + 8 + 9. Exactly one catalogue adjustment path; successful submit
// does not repeat apply; failed apply still retries.
assert.match(successSrc, /alreadyApplied=/);
assert.match(successSrc, /CATALOGUE_VOUCHER_ADJUSTMENT_CODE/);
assert.match(retrySrc, /alreadyApplied = false/);
assert.match(retrySrc, /if \(alreadyApplied\)/);
assert.match(retrySrc, /writeSelectedCatalogueVoucherId\(null\)/);
assert.match(retrySrc, /applyGuestCatalogueVoucherAction\(orderId, voucherId\)/);
assert.ok(
  retrySrc.indexOf("if (alreadyApplied)") <
    retrySrc.indexOf("applyGuestCatalogueVoucherAction(orderId, voucherId)"),
);
assert.match(submitFn, /window\.location\.assign|applyGuestCatalogueVoucherAction/);
assert.match(
  formSrc,
  /window\.location\.assign\(`\/order\/success\?order=\$\{orderId\}`\)/,
);
assert.ok(
  submitFn.indexOf("applyGuestCatalogueVoucherAction") <
    submitFn.indexOf("return { error: null, orderId }") ||
    submitFn.includes("applyGuestCatalogueVoucherAction(orderId, catalogueVoucherId)"),
);

// 10. No-adjustment orders still load the receipt and do not invent a voucher.
assert.match(successSrc, /receipt \? <SaveOrderDetailsButton receipt=\{receipt\} \/>/);
assert.match(receiptSrc, /order_adjustments/);
assert.match(receiptSrc, /getEffectiveAdjustments/);
assert.match(receiptSrc, /calculateOrderSettlement/);
assert.doesNotMatch(receiptSrc, /apply_catalogue_voucher_to_guest_order/);

// 11. OCT265 remains RM140 - RM5 = RM135.
const oct265: CatalogueVoucherRecord = {
  id: "oct265",
  code: "OCT265",
  voucherType: "fixed_amount",
  value: 5,
  validFrom: "2026-09-01",
  validUntil: "2026-10-31",
  status: "active",
  imageUrl: null,
  assetId: null,
  rules: emptyCatalogueRules(),
};
const octoberInput: CatalogueEligibilityInput = {
  orderDate: "2026-09-25",
  fulfilmentDate: "2026-10-10",
  today: "2026-09-25",
  hasAugustPromo: false,
  hasRm10Card: false,
  hasCatalogueVoucher: false,
  orderType: "preorder",
  items: [
    {
      cakeId: "earl-grey-pistachio",
      cakeSizeId: "earl-grey-pistachio-6",
      sizeLabel: '6"',
      quantity: 1,
      unitPrice: 140,
    },
  ],
};
const octoberEligible = evaluateCatalogueVoucherEligibility(oct265, octoberInput);
assert.equal(octoberEligible.eligible, true);
assert.equal(octoberEligible.amount, -5);
assert.equal(catalogueVoucherPreviewPayable(140, {
  id: oct265.id,
  code: oct265.code,
  amount: octoberEligible.amount ?? 0,
}), 135);
const storedSettlement = calculateOrderSettlement({
  items: [{ unitPrice: 140, quantity: 1 }],
  adjustments: getEffectiveAdjustments([
    {
      code: CATALOGUE_VOUCHER_ADJUSTMENT_CODE,
      amount: -5,
      status: "active",
      reversesAdjustmentId: null,
    },
  ]),
  allocations: [],
  refunds: [],
});
assert.equal(storedSettlement.subtotal, 140);
assert.equal(storedSettlement.totalAdjustments, -5);
assert.equal(storedSettlement.amountDue, 135);
assert.equal(
  evaluateCatalogueVoucherEligibility(oct265, {
    ...octoberInput,
    hasAugustPromo: true,
  }).eligible,
  false,
);
assert.equal(
  evaluateCatalogueVoucherEligibility(oct265, {
    ...octoberInput,
    hasRm10Card: true,
  }).eligible,
  false,
);
assert.equal(
  evaluateCatalogueVoucherEligibility(oct265, {
    ...octoberInput,
    hasCatalogueVoucher: true,
  }).eligible,
  false,
);

// 12 + 13. PNG and Crew settlement still read stored adjustments.
assert.match(orderDetailsSrc, /receipt\.adjustments/);
assert.match(successSrc, /SaveOrderDetailsButton receipt=\{receipt\}/);
assert.match(crewPreviewSrc, /getEffectiveAdjustments\(order\.adjustments\)/);
assert.match(crewPreviewSrc, /settlement\.amountDue/);

// Guest success revalidation is unnecessary before a hard navigation.
assert.doesNotMatch(voucherActionsSrc, /revalidatePath\("\/order\/success"\)/);
assert.match(voucherActionsSrc, /revalidatePath\("\/owner"\)/);
assert.match(voucherActionsSrc, /revalidatePath\(`\/owner\/orders\/\$\{orderId\}`\)/);

console.log("PASS checkout critical path");
