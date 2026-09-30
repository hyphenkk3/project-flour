/**
 * Fresh Pick Walk-in Hold → Sold: engine, UI wiring, RPC reuse.
 * Run: npx tsx scripts/test-extra-walk-in-sale.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  extraWalkInSalePickupDate,
  WALK_IN_SALE_GUEST_NAME,
  WALK_IN_SALE_REQUIRES_HOLD_ERROR,
} from "@/engines/extra/walk-in-sale";
import { emptyCatalogueRules } from "@/engines/vouchers/catalogue-voucher";
import { evaluateDraftCatalogueVouchers } from "@/engines/vouchers/catalogue-voucher-context";
import { catalogueVoucherPreviewPayable } from "@/workspaces/storefront/offers/CatalogueVoucherAmountLines";
import type { CatalogueVoucherRecord } from "@/types/catalogue-voucher";

function readSrc(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

assert.equal(WALK_IN_SALE_GUEST_NAME, "WALK-IN");
assert.match(WALK_IN_SALE_REQUIRES_HOLD_ERROR, /Walk-in Hold/);

assert.equal(
  extraWalkInSalePickupDate({
    preparedOn: "2026-09-29",
    pickupAvailableFromAt: "2026-09-29T01:00:00.000Z",
    pickupThroughAt: "2026-09-29T09:00:00.000Z",
    now: new Date("2026-09-29T04:00:00.000Z"),
  }),
  "2026-09-29",
  "today inside Extra window is the collection date",
);

assert.equal(
  extraWalkInSalePickupDate({
    preparedOn: "2026-09-30",
    pickupAvailableFromAt: "2026-09-30T01:00:00.000Z",
    pickupThroughAt: "2026-09-30T09:00:00.000Z",
    now: new Date("2026-09-29T04:00:00.000Z"),
  }),
  "2026-09-30",
  "outside the window uses prepared_on",
);

const rm10: CatalogueVoucherRecord = {
  id: "rm10",
  code: "RM10",
  voucherType: "fixed_amount",
  value: 10,
  validFrom: "2026-01-01",
  validUntil: "2026-12-31",
  status: "active",
  imageUrl: null,
  assetId: null,
  rules: emptyCatalogueRules(),
};
const freshPickOnly: CatalogueVoucherRecord = {
  ...rm10,
  id: "fp-only",
  code: "FP10",
  rules: { ...emptyCatalogueRules(), orderTypes: ["fresh_pick"] },
};
const preorderOnly: CatalogueVoucherRecord = {
  ...rm10,
  id: "pre-only",
  code: "PRE10",
  rules: { ...emptyCatalogueRules(), orderTypes: ["preorder"] },
};
const extraDraft = {
  pickupDate: "2026-09-29",
  items: [
    {
      cakeId: "cake-1",
      sizeId: "size-1",
      sizeLabel: '4"',
      quantity: 1,
      unitPrice: 75,
    },
  ],
};
const today = "2026-09-29";
const extraEval = evaluateDraftCatalogueVouchers(
  [rm10, freshPickOnly, preorderOnly],
  extraDraft,
  today,
  "fresh_pick",
);
assert.equal(
  extraEval.find((row) => row.voucher.id === "rm10")?.result.eligible,
  true,
);
assert.equal(
  extraEval.find((row) => row.voucher.id === "fp-only")?.result.eligible,
  true,
  "Fresh Pick-only voucher is available for extra_stock / Fresh Pick",
);
assert.equal(
  extraEval.find((row) => row.voucher.id === "pre-only")?.result.eligible,
  false,
  "Pre-order-only voucher is not available for a Fresh Pick walk-in sale",
);
const rm10Amount = extraEval.find((row) => row.voucher.id === "rm10")?.result
  .amount;
assert.equal(rm10Amount, -10);
assert.equal(catalogueVoucherPreviewPayable(75, {
  id: "rm10",
  code: "RM10",
  headline: "RM10 OFF",
  amount: -10,
}), 65);

const preorderEval = evaluateDraftCatalogueVouchers(
  [freshPickOnly],
  extraDraft,
  today,
  "preorder",
);
assert.equal(
  preorderEval[0]?.result.eligible,
  false,
  "Fresh Pick-only voucher is not available on a non-Fresh-Pick order",
);

const saleSql = readSrc(
  "supabase/migrations/20260929160000_complete_extra_stock_walk_in_sale.sql",
);
assert.match(saleSql, /complete_extra_stock_walk_in_sale/);
assert.match(saleSql, /extra_walk_in_sale_pickup_date/);
assert.match(saleSql, /'WALK-IN'/);
assert.match(saleSql, /'walk_in'/);
assert.match(saleSql, /library_cake_size_price_on/);
assert.match(saleSql, /apply_catalogue_voucher_to_guest_order/);
assert.match(saleSql, /record_and_verify_guest_order_payment/);
assert.match(saleSql, /_clear_extra_walk_in_hold/);
assert.match(saleSql, /Sold is only available from an active Walk-in Hold/);
assert.match(saleSql, /'wb_qr', 'online_transfer', 'others'/);
assert.doesNotMatch(saleSql, /submit_guest_extra_order/);

const holdSql = readSrc(
  "supabase/migrations/20260917140000_extra_walk_in_hold.sql",
);
assert.match(
  holdSql,
  /This Fresh Pick is currently on walk-in hold\./,
);

const dialogSrc = readSrc(
  "src/workspaces/extra/WalkInHoldCompleteSaleDialog.tsx",
);
assert.match(dialogSrc, /evaluateDraftCatalogueVouchers/);
assert.match(dialogSrc, /"fresh_pick"/);
assert.match(dialogSrc, /PAYMENT_METHOD_LABELS/);
assert.match(dialogSrc, /Confirm Sale/);
assert.match(dialogSrc, /completeExtraStockWalkInSaleAction/);
assert.match(dialogSrc, /No voucher/);
assert.doesNotMatch(dialogSrc, /invent/);

const panelSrc = readSrc("src/workspaces/extra/WalkInHoldPanel.tsx");
assert.match(panelSrc, />\s*Sold\s*</);
assert.match(panelSrc, /canCompleteWalkInSale/);
assert.match(panelSrc, /Walk-in Hold/);

const homeSrc = readSrc("src/workspaces/home/HomeFreshPicksOperations.tsx");
assert.match(homeSrc, /Assign to order/);
assert.match(homeSrc, /WalkInHoldCompleteSaleDialog/);
assert.match(homeSrc, /flags\.sell \? onSold/);
assert.doesNotMatch(homeSrc, /Available → Sold/);

const calendarSrc = readSrc("src/workspaces/owner/calendar/queries.ts");
assert.match(calendarSrc, /guestOrderDisplayName/);
assert.doesNotMatch(calendarSrc, /WALK-IN/);

console.log("EXTRA walk-in sale: PASS");
