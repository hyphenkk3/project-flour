/**
 * Catalogue voucher eligibility engine + wiring.
 * Run: npx --cache /tmp/npm-cache-voucher --yes tsx scripts/test-catalogue-voucher-engine.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  emptyCatalogueRules,
  evaluateCatalogueVoucherEligibility,
  formatCatalogueVoucherHeadline,
  isCatalogueVoucherDiscoverable,
} from "@/engines/vouchers/catalogue-voucher";
import { CATALOGUE_VOUCHER_ADJUSTMENT_CODE } from "@/types/catalogue-voucher";
import type {
  CatalogueEligibilityInput,
  CatalogueVoucherRecord,
  CatalogueVoucherRules,
} from "@/types/catalogue-voucher";
import { evaluateAugustPromoEligibility } from "@/engines/orders/promotions";
import { parseCatalogueRulesFromForm } from "@/workspaces/library/vouchers/rules";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function voucher(
  overrides: Partial<CatalogueVoucherRecord> & {
    rules?: Partial<CatalogueVoucherRules>;
  } = {},
): CatalogueVoucherRecord {
  const { rules, ...rest } = overrides;
  return {
    id: "voucher-1",
    code: "TEST10",
    voucherType: "fixed_amount",
    value: 10,
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
    status: "active",
    imageUrl: null,
    assetId: null,
    rules: { ...emptyCatalogueRules(), ...rules },
    ...rest,
  };
}

function input(
  overrides: Partial<CatalogueEligibilityInput> = {},
): CatalogueEligibilityInput {
  return {
    orderDate: "2026-08-05",
    fulfilmentDate: "2026-08-15",
    today: "2026-08-05",
    hasAugustPromo: false,
    hasRm10Card: false,
    hasCatalogueVoucher: false,
    orderType: "preorder",
    items: [
      {
        cakeId: "pistachio",
        cakeSizeId: "pistachio-6",
        sizeLabel: '6"',
        quantity: 1,
        unitPrice: 120,
      },
    ],
    ...overrides,
  };
}

const pistachio6 = {
  cakeId: "pistachio",
  cakeSizeId: "pistachio-6",
  sizeLabel: '6"',
  quantity: 1,
  unitPrice: 120,
};
const pistachio4 = {
  cakeId: "pistachio",
  cakeSizeId: "pistachio-4",
  sizeLabel: '4"',
  quantity: 1,
  unitPrice: 80,
};
const chocolate6 = {
  cakeId: "chocolate",
  cakeSizeId: "chocolate-6",
  sizeLabel: '6"',
  quantity: 1,
  unitPrice: 120,
};
const earlGrey8 = {
  cakeId: "earl-grey",
  cakeSizeId: "earl-grey-8",
  sizeLabel: '8"',
  quantity: 1,
  unitPrice: 150,
};

const fullRules: Partial<CatalogueVoucherRules> = {
  orderDate: { from: "2026-08-01", until: "2026-08-10" },
  fulfilmentDate: { from: "2026-08-01", until: "2026-08-31" },
  minimumCakeSubtotal: 100,
  cakeIds: ["pistachio"],
  sizeLabels: ['6"', '8"'],
};

// A. All configured conditions pass
assert.equal(
  evaluateCatalogueVoucherEligibility(voucher({ rules: fullRules }), input())
    .eligible,
  true,
);

// B. 4" of an eligible cake when only 6"/8" allowed
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({ rules: fullRules }),
    input({ items: [pistachio4] }),
  ).eligible,
  false,
);

// C. Correct cake, wrong size
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({
      rules: { cakeIds: ["pistachio"], sizeLabels: ['6"', '8"'] },
    }),
    input({ items: [pistachio4] }),
  ).eligible,
  false,
);

// D. Correct size, wrong cake
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({
      rules: { cakeIds: ["pistachio"], sizeLabels: ['6"', '8"'] },
    }),
    input({ items: [chocolate6] }),
  ).eligible,
  false,
);

// E. Cake subtotal exactly RM100 with minimum RM100
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({ rules: { minimumCakeSubtotal: 100 } }),
    input({
      items: [{ ...pistachio6, unitPrice: 100 }],
    }),
  ).eligible,
  true,
);

// F. Cake subtotal RM99.99 with minimum RM100
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({ rules: { minimumCakeSubtotal: 100 } }),
    input({
      items: [{ ...pistachio6, unitPrice: 99.99 }],
    }),
  ).eligible,
  false,
);

// G. Order date outside range
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({ rules: fullRules }),
    input({ orderDate: "2026-08-11" }),
  ).eligible,
  false,
);

// H. Fulfilment date outside range
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({ rules: fullRules }),
    input({ fulfilmentDate: "2026-09-01" }),
  ).eligible,
  false,
);

// I. No order-date rule
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({
      rules: {
        fulfilmentDate: { from: "2026-08-01", until: "2026-08-31" },
      },
    }),
    input({ orderDate: "2026-01-01" }),
  ).eligible,
  true,
);

// J. No fulfilment-date rule
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({
      rules: { orderDate: { from: "2026-08-01", until: "2026-08-10" } },
    }),
    input({ fulfilmentDate: "2026-12-01" }),
  ).eligible,
  true,
);

// K. No minimum-spend rule
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher(),
    input({
      items: [{ ...pistachio6, unitPrice: 10 }],
    }),
  ).eligible,
  true,
);

// L. No cake rule
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({ rules: { sizeLabels: ['6"'] } }),
    input({ items: [chocolate6] }),
  ).eligible,
  true,
);

// M. No size rule
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({ rules: { cakeIds: ["pistachio"] } }),
    input({ items: [pistachio4] }),
  ).eligible,
  true,
);

// N. Same line satisfies cake + size
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({
      rules: { cakeIds: ["pistachio"], sizeLabels: ['6"', '8"'] },
    }),
    input({ items: [pistachio6, chocolate6] }),
  ).eligible,
  true,
);

// O. Eligible cake on one line + eligible size on another
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({
      rules: { cakeIds: ["pistachio"], sizeLabels: ['6"', '8"'] },
    }),
    input({ items: [pistachio4, chocolate6] }),
  ).eligible,
  false,
);

// P. Multiple eligible cakes: any configured cake
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({ rules: { cakeIds: ["pistachio", "earl-grey"] } }),
    input({ items: [earlGrey8] }),
  ).eligible,
  true,
);

// Q. Multiple sizes: any configured size
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({ rules: { sizeLabels: ['6"', '8"'] } }),
    input({ items: [earlGrey8] }),
  ).eligible,
  true,
);

// R. Inactive / draft / retired cannot apply
for (const status of ["draft", "retired", "scheduled", "expired"] as const) {
  assert.equal(
    evaluateCatalogueVoucherEligibility(voucher({ status }), input()).eligible,
    false,
  );
}

// S. Validity date passed
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher({ validUntil: "2026-08-01" }),
    input({ today: "2026-08-02" }),
  ).eligible,
  false,
);

// T. Duplicate application
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher(),
    input({ hasCatalogueVoucher: true }),
  ).eligible,
  false,
);

// U. Client amount is ignored by the apply action
const applySrc = readSrc("src/workspaces/vouchers/catalogue-actions.ts");
assert.match(
  applySrc,
  /Client-provided discount amounts are not accepted/,
);
assert.match(applySrc, /clientAmount/);
assert.doesNotMatch(applySrc, /p_amount/);

// V. August Promo remains strictly greater than RM100
assert.equal(
  evaluateAugustPromoEligibility({
    orderSource: "customer_website",
    orderDate: "2026-08-05",
    pickupDate: "2026-08-15",
    cakeSubtotal: 100,
    hasAugustPromo: false,
    hasRm10Card: false,
    hasVerifiedPayments: false,
    orderStatus: "submitted",
  }).eligible,
  false,
);
assert.equal(
  evaluateAugustPromoEligibility({
    orderSource: "customer_website",
    orderDate: "2026-08-05",
    pickupDate: "2026-08-15",
    cakeSubtotal: 100.01,
    hasAugustPromo: false,
    hasRm10Card: false,
    hasVerifiedPayments: false,
    orderStatus: "submitted",
  }).eligible,
  true,
);

// W. RM10 remains a separate workflow
const rm10Latest = readSrc(
  "supabase/migrations/20260924180000_authoritative_library_rm10_expiry.sql",
);
assert.match(rm10Latest, /rm10_physical_card/);
assert.doesNotMatch(rm10Latest, /library_voucher_rules/);
assert.doesNotMatch(
  readSrc("supabase/migrations/20260924190000_catalogue_voucher_engine.sql"),
  /physical_discount_vouchers/,
);

// X. No-rule catalogue voucher is a valid record and is not auto-applied
const noRule = evaluateCatalogueVoucherEligibility(voucher(), input());
assert.equal(noRule.eligible, true);
assert.equal(noRule.applicable, true);
const cartSrc = readSrc(
  "src/workspaces/storefront/offers/CatalogueVoucherCartPanel.tsx",
);
assert.match(cartSrc, /writeSelectedCatalogueVoucherId/);
assert.doesNotMatch(cartSrc, /applyGuestCatalogueVoucherAction/);
const crewSrc = readSrc(
  "src/workspaces/owner/orders/CatalogueVoucherPaymentPanel.tsx",
);
assert.match(crewSrc, /applyCatalogueVoucherAction/);
assert.doesNotMatch(cartSrc, /automatically apply/);

// Discovery is independent of an order
assert.equal(
  isCatalogueVoucherDiscoverable(voucher({ status: "draft" }), "2026-08-05"),
  false,
);
assert.equal(
  isCatalogueVoucherDiscoverable(voucher(), "2026-08-05"),
  true,
);

// Complimentary is visible but not applied
const complimentary = evaluateCatalogueVoucherEligibility(
  voucher({ voucherType: "complimentary" }),
  input(),
);
assert.equal(complimentary.eligible, false);
assert.equal(complimentary.applicable, false);
assert.match(String(complimentary.reason), /Complimentary/);

// Shared engine + surfaces
const engineSrc = readSrc("src/engines/vouchers/catalogue-voucher.ts");
assert.match(engineSrc, /evaluateCatalogueVoucherEligibility/);
assert.match(engineSrc, /moneyCompare\(cakeSubtotal, minimum\) >= 0/);
assert.match(
  readSrc("src/workspaces/storefront/offers/StorefrontOffersPage.tsx"),
  /isCatalogueVoucherDiscoverable/,
);
assert.match(
  readSrc("src/workspaces/storefront/cart/StorefrontCartShell.tsx"),
  /CatalogueVoucherCartPanel/,
);
assert.match(
  readSrc("src/workspaces/owner/orders/OrderDiscountsPanel.tsx"),
  /CatalogueVoucherPaymentPanel/,
);
assert.match(
  readSrc("src/workspaces/library/vouchers/VoucherForm.tsx"),
  /Eligibility/,
);
assert.match(
  readSrc("src/workspaces/library/vouchers/actions.ts"),
  /replaceLibraryVoucherRules/,
);
assert.match(
  readSrc("src/workspaces/storefront/home/StorefrontBrowsePage.tsx"),
  /href="\/offers"/,
);
assert.match(
  readSrc("src/workspaces/storefront/catalog/StorefrontCakeDetail.tsx"),
  /CakeOfferHint/,
);
assert.equal(CATALOGUE_VOUCHER_ADJUSTMENT_CODE, "catalogue_voucher");
assert.equal(formatCatalogueVoucherHeadline(voucher()), "RM10 OFF");

const migration = readSrc(
  "supabase/migrations/20260924190000_catalogue_voucher_engine.sql",
);
assert.match(migration, /create table public.library_voucher_rules/);
assert.match(migration, /c_code constant text := 'catalogue_voucher'/);
assert.match(migration, /Cannot stack with August Promo/);
assert.match(migration, /list_public_catalogue_vouchers/);
assert.match(migration, /grant execute on function public.list_public_catalogue_vouchers\(\) to anon, authenticated/);
assert.match(
  migration,
  /grant execute on function public.apply_catalogue_voucher_to_guest_order\(uuid, uuid, uuid\) to authenticated/,
);
assert.doesNotMatch(
  migration,
  /grant execute on function public.apply_catalogue_voucher_to_guest_order\(uuid, uuid, uuid\) to anon/,
);

const form = new FormData();
form.set("order_date_from", "2026-08-10");
form.set("order_date_until", "2026-08-01");
assert.equal(
  parseCatalogueRulesFromForm(form, new Set(), ['4"', '6"', '8"']),
  "Order date until must be on or after order date from.",
);

const validForm = new FormData();
validForm.set("minimum_cake_subtotal", "100");
validForm.append("eligible_size", '6"');
validForm.append("eligible_cake", "cake-1");
const parsed = parseCatalogueRulesFromForm(
  validForm,
  new Set(["cake-1"]),
  ['4"', '6"', '8"'],
);
assert.ok(typeof parsed !== "string");
if (typeof parsed !== "string") {
  assert.equal(parsed.minimumCakeSubtotal, 100);
  assert.deepEqual(parsed.sizeLabels, ['6"']);
  assert.deepEqual(parsed.cakeIds, ["cake-1"]);
  assert.deepEqual(parsed.orderTypes, []);
}

const preorderOnly = voucher({ rules: { orderTypes: ["preorder"] } });
const freshOnly = voucher({ rules: { orderTypes: ["fresh_pick"] } });
const bothTypes = voucher({
  rules: { orderTypes: ["preorder", "fresh_pick"] },
});
const restricted = voucher({
  rules: {
    ...fullRules,
    orderTypes: ["preorder"],
  },
});

assert.equal(
  evaluateCatalogueVoucherEligibility(voucher(), input()).eligible,
  true,
);
assert.equal(
  evaluateCatalogueVoucherEligibility(
    voucher(),
    input({ orderType: "fresh_pick" }),
  ).eligible,
  true,
);
assert.equal(
  evaluateCatalogueVoucherEligibility(preorderOnly, input()).eligible,
  true,
);
assert.equal(
  evaluateCatalogueVoucherEligibility(
    preorderOnly,
    input({ orderType: "fresh_pick" }),
  ).eligible,
  false,
);
assert.equal(
  evaluateCatalogueVoucherEligibility(
    freshOnly,
    input({ orderType: "fresh_pick" }),
  ).eligible,
  true,
);
assert.equal(
  evaluateCatalogueVoucherEligibility(freshOnly, input()).eligible,
  false,
);
assert.equal(
  evaluateCatalogueVoucherEligibility(bothTypes, input()).eligible,
  true,
);
assert.equal(
  evaluateCatalogueVoucherEligibility(
    bothTypes,
    input({ orderType: "fresh_pick" }),
  ).eligible,
  true,
);
assert.equal(
  evaluateCatalogueVoucherEligibility(
    restricted,
    input({ orderType: "fresh_pick" }),
  ).eligible,
  false,
);

const applyMigration = readSrc(
  "supabase/migrations/20260925100000_catalogue_voucher_order_type.sql",
);
assert.match(applyMigration, /extra_stock_id/);
assert.match(applyMigration, /This voucher is not available for this order type/);
assert.match(applyMigration, /value_code/);
assert.doesNotMatch(applyMigration, /physical_discount_vouchers/);

assert.match(cartSrc, /orderType/);
assert.match(
  readSrc("src/workspaces/storefront/extra/FreshPickCartShell.tsx"),
  /orderType="fresh_pick"/,
);
assert.match(
  readSrc("src/workspaces/owner/orders/CatalogueVoucherPaymentPanel.tsx"),
  /evaluateOrderCatalogueVouchers/,
);
assert.match(
  readSrc("src/engines/vouchers/catalogue-voucher-context.ts"),
  /catalogueOrderTypeFromExtraStockId/,
);
assert.match(
  readSrc("src/workspaces/storefront/home/HomeMobileNav.tsx"),
  /href: "\/order", label: "Order"[\s\S]*href: "\/browse", label: "Browse Cakes"[\s\S]*href: "\/offers", label: "Current Offers"[\s\S]*href: "\/extra", label: "Fresh Picks"[\s\S]*href: "\/faq", label: "FAQ"/,
);
assert.match(
  readSrc("src/workspaces/storefront/home/StorefrontHomePage.tsx"),
  /href="\/browse"[\s\S]*Browse Cakes[\s\S]*href="\/offers"[\s\S]*Current Offers[\s\S]*href="\/extra"[\s\S]*Fresh Picks[\s\S]*href="\/faq"[\s\S]*FAQ/,
);
assert.match(
  readSrc("src/workspaces/library/vouchers/VoucherForm.tsx"),
  /Eligible order type/,
);
assert.match(
  readSrc("src/workspaces/storefront/offers/StorefrontOffersPage.tsx"),
  /summarizeCatalogueVoucherRules|CatalogueOfferCard/,
);

const publicQueriesSrc = readSrc("src/workspaces/vouchers/catalogue-queries.ts");
const publicListFn = publicQueriesSrc.slice(
  publicQueriesSrc.indexOf("export async function listPublicCatalogueVouchers"),
  publicQueriesSrc.indexOf("export async function listStaffCatalogueVouchers"),
);
assert.match(publicListFn, /createPublicClient/);
assert.doesNotMatch(publicListFn, /createClient\(/);

const middlewareSrc = readSrc("src/middleware.ts");
assert.match(
  middlewareSrc.split("const PUBLIC_PATHS")[1]?.split("function isPublicPath")[0] ??
    "",
  /"\/offers"/,
);
assert.match(middlewareSrc, /pathname\.startsWith\("\/cakes\/"\)/);

console.log("catalogue voucher engine tests passed");
