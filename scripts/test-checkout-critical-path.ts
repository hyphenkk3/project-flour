/**
 * Phase 2C: Confirm Order critical path.
 * Duplicate pre-submit reads are skipped because submit_guest_preorder
 * already enforces the same rules. Voucher apply stays server-authoritative.
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
const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraCheckoutForm.tsx",
);
const crewPreviewSrc = readSrc(
  "src/workspaces/owner/orders/PaymentRequestPreview.tsx",
);
const orderDetailsSrc = readSrc(
  "src/workspaces/storefront/checkout/order-details-card.ts",
);
const submitSql = readSrc(
  "supabase/migrations/20260922180000_guest_preorder_delivery_processing_ack.sql",
);
const applySql = readSrc(
  "supabase/migrations/20260925100000_catalogue_voucher_order_type.sql",
);
const combinedSql = readSrc(
  "supabase/migrations/20260925120000_submit_guest_preorder_with_catalogue_voucher.sql",
);

const submitFn = sliceFn(actionsSrc, "async function submitGuestPreorderActionBody", [
  "\nexport async function loadCheckoutPickupOffer",
  "\nexport type CheckoutPickupOffer",
]);
const guestApplyFn = sliceFn(
  voucherActionsSrc,
  "async function applyGuestCatalogueVoucherActionTimed",
  [],
);
const applyAuthoritativeFn = sliceFn(
  voucherActionsSrc,
  "export async function applyCatalogueVoucherAuthoritative",
  ["export async function listPublicCatalogueVouchersAction"],
);
const applyOrderFn = sliceFn(
  voucherQueriesSrc,
  "export async function loadCatalogueApplyOrder",
  ["export function voucherRelevantToCake"],
);

assert.match(submitFn, /submit_guest_preorder/);
assert.match(submitFn, /submit_guest_preorder_with_catalogue_voucher/);
assert.match(submitFn, /setGuestPreorderReceiptCookie\(orderId\)/);
assert.match(submitFn, /p_price_ack/);
assert.match(submitFn, /validateDineInPartyFromForm/);
assert.match(submitFn, /validateOwnerCreateFulfilment/);
assert.match(submitFn, /complimentaryPayloadFromForm/);
assert.match(submitFn, /paidAddonPayloadFromForm/);
for (const skipped of [
  "isPickupOrdersClosed",
  "loadOperatingHoursSnapshot",
  "getStorefrontCollectionForPickupDate",
  "listAvailableCakes",
  "loadLivePreorderDaysBySizeId",
  "loadMalaysiaPreorderBusinessDate",
  "loadCustomerCartDateCapacity",
  "loadCustomerPreorderOptions",
]) {
  assert.match(
    submitFn,
    new RegExp(`logPerfSkipped\\("CHECKOUT_SUBMIT", "${skipped}"\\)`),
  );
}
assert.doesNotMatch(submitFn, /evaluateCollectionDate\(/);
assert.doesNotMatch(submitFn, /isValidPickupSlot\(/);
assert.doesNotMatch(submitFn, /listAvailableCakes\(/);

assert.match(submitSql, /is_pickup_orders_closed\(p_pickup_date\)/);
assert.match(submitSql, /is_valid_public_pickup_slot/);
assert.match(submitSql, /is_valid_dine_in_slot/);
assert.match(submitSql, /is_valid_delivery_slot/);
assert.match(submitSql, /storefront_collection_for_pickup_date/);
assert.match(submitSql, /collection_cakes/);
assert.match(submitSql, /Cake size is not available/);
assert.match(submitSql, /earliest_preorder_collection_date/);
assert.match(submitSql, /_guest_preorder_item_fully_booked/);
assert.match(submitSql, /Complimentary item is not available/);
assert.match(submitSql, /Paid add-on is not available/);
assert.match(submitSql, /library_cake_size_price_on/);

assert.match(combinedSql, /submit_guest_preorder\(/);
assert.match(combinedSql, /apply_catalogue_voucher_to_guest_order\(/);
assert.match(combinedSql, /Does not copy financial logic|Delegates to submit_guest_preorder/);
assert.doesNotMatch(combinedSql, /insert into public.order_adjustments/);

assert.match(applyAuthoritativeFn, /Client-provided discount amounts are not accepted/);
assert.match(applyAuthoritativeFn, /if \(!input.actorStaffId\)/);
assert.match(applyAuthoritativeFn, /apply_catalogue_voucher_to_guest_order/);
assert.match(applyAuthoritativeFn, /evaluateCatalogueVoucherEligibility/);
assert.match(guestApplyFn, /guestPreorderReceiptAuthorized\(orderId, cookieOrderId\)/);
assert.doesNotMatch(guestApplyFn, /getGuestPreorderReceipt\(/);
assert.doesNotMatch(applyOrderFn, /library_cake_photos/);
assert.match(applyOrderFn, /if \(!order \|\| order\.customer_id\) return null/);
assert.equal(guestPreorderReceiptAuthorized("order-a", "order-a"), true);
assert.equal(guestPreorderReceiptAuthorized("order-a", "order-b"), false);
assert.equal(guestPreorderReceiptAuthorized("order-a", null), false);

assert.match(applySql, /customer_id is null/);
assert.match(applySql, /already applied/);
assert.match(applySql, /august_promo_2026/);
assert.match(applySql, /rm10_physical_card/);
assert.match(applySql, /order_date/);
assert.match(applySql, /fulfilment_date/);
assert.match(applySql, /minimum_cake_subtotal/);
assert.match(applySql, /order_type/);
assert.match(applySql, /insert into public.order_adjustments/);

assert.match(successSrc, /alreadyApplied=/);
assert.match(successSrc, /CATALOGUE_VOUCHER_ADJUSTMENT_CODE/);
assert.match(retrySrc, /if \(alreadyApplied\)/);
assert.match(retrySrc, /applyGuestCatalogueVoucherAction\(orderId, voucherId\)/);
assert.match(submitFn, /if \(applied\.error\)/);
assert.match(formSrc, /router\.replace\(`\/order\/success\?order=\$\{orderId\}`\)/);
assert.match(extraFormSrc, /router\.replace\(/);
assert.doesNotMatch(formSrc, /window\.location\.assign\(`\/order\/success/);
assert.match(receiptSrc, /Promise\.all\(\[/);
assert.match(receiptSrc, /order_adjustments/);
assert.match(receiptSrc, /library_cake_photos/);
assert.match(receiptSrc, /getEffectiveAdjustments/);
assert.match(receiptSrc, /calculateOrderSettlement/);

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
assert.equal(
  catalogueVoucherPreviewPayable(140, {
    id: oct265.id,
    code: oct265.code,
    amount: octoberEligible.amount ?? 0,
  }),
  135,
);
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

assert.match(orderDetailsSrc, /receipt\.adjustments/);
assert.match(successSrc, /SuccessReceiptRecap/);
assert.match(successSrc, /<Suspense/);
assert.match(
  readSrc("src/workspaces/storefront/checkout/SuccessReceiptPhotos.tsx"),
  /SaveOrderDetailsButton/,
);
assert.match(
  formSrc,
  /useLayoutEffect\(\(\) => \{[\s\S]*beginSuccessNavigationPerf/,
);
assert.match(
  extraFormSrc,
  /useLayoutEffect\(\(\) => \{[\s\S]*beginSuccessNavigationPerf/,
);
assert.match(crewPreviewSrc, /getEffectiveAdjustments\(order\.adjustments\)/);
assert.match(crewPreviewSrc, /settlement\.amountDue/);
assert.doesNotMatch(voucherActionsSrc, /revalidatePath\("\/order\/success"\)/);
assert.match(voucherActionsSrc, /revalidatePath\("\/owner"\)/);

console.log("PASS checkout critical path");
