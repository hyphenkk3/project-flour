/**
 * Voucher Library + RM10 Physical Card management.
 * Run: npx tsx scripts/test-voucher-library-rm10.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canManageLibrary,
  canManageRm10PhysicalCards,
  canViewLibrary,
} from "@/foundation/navigation/access";
import {
  evaluateRm10CardEligibility,
  evaluateRm10CardRuleFit,
  getEffectiveAdjustments,
  physicalVoucherNumberFromMetadata,
} from "@/engines/orders/promotions";
import {
  buildRm10LibraryRows,
  deriveRm10LibraryStatus,
  evaluateRegisteredPhysicalRm10Expiry,
  filterRm10LibraryRows,
  findRm10LibraryRowsByNumber,
  formatAlreadyExistMessage,
  isRm10UsedAfterExpiry,
  normalizePhysicalVoucherNumber,
  parseSingleVoucherNumber,
  parseVoucherNumberList,
  parseVoucherNumberRange,
  planRm10PhysicalVoucherInserts,
  RM10_RANGE_DIGITS_REQUIRED,
  RM10_VOUCHER_DIGITS_REQUIRED,
  summarizeRm10Library,
} from "@/engines/vouchers/physical-rm10";
import type { Rm10LibraryRedemption } from "@/types/rm10-physical-voucher";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function redemption(
  partial: Partial<Rm10LibraryRedemption> &
    Pick<Rm10LibraryRedemption, "adjustmentId" | "voucherNumber">,
): Rm10LibraryRedemption {
  return {
    orderId: partial.orderId ?? "order-1",
    orderNumber: partial.orderNumber ?? "WB1234",
    customerName: partial.customerName ?? "John Tan",
    orderDate: partial.orderDate ?? "2026-09-18",
    redeemedDate: partial.redeemedDate ?? "2026-09-18",
    fulfilmentDate: partial.fulfilmentDate ?? "2026-09-25",
    fulfilmentMethodLabel: partial.fulfilmentMethodLabel ?? "Pickup",
    discountAmount: partial.discountAmount ?? -10,
    expiryDate: partial.expiryDate ?? "2026-12-31",
    ownerOverride: partial.ownerOverride ?? false,
    overrideByName: partial.overrideByName ?? null,
    ...partial,
  };
}

// 1–3 authorization
assert.equal(canManageRm10PhysicalCards("owner"), true);
assert.equal(canManageRm10PhysicalCards("manager"), true);
assert.equal(canManageRm10PhysicalCards("bakery"), false);
assert.equal(canManageRm10PhysicalCards("customer_operations"), false);
assert.equal(canManageRm10PhysicalCards("collection"), false);
assert.equal(canManageLibrary("owner"), true);
assert.equal(canViewLibrary("bakery"), true);
assert.equal(canViewLibrary("collection"), false);

const addAction = readSrc("src/workspaces/library/vouchers/rm10/actions.ts");
assert.match(addAction, /canManageRm10PhysicalCards/);
assert.match(addAction, /physical_discount_vouchers/);
assert.match(addAction, /library_managed: true/);
assert.match(addAction, /created_by: staff\.id/);
assert.doesNotMatch(addAction, /status: "redeemed"/);
assert.doesNotMatch(addAction, /Mark as Used/);
assert.doesNotMatch(addAction, /^export const /m);

const addForm = readSrc(
  "src/workspaces/library/vouchers/rm10/Rm10PhysicalForm.tsx",
);
assert.match(addForm, /from "@\/workspaces\/library\/vouchers\/rm10\/action-state"/);
assert.doesNotMatch(addForm, /rm10LibraryActionInitialState.*actions/);

const rm10Page = readSrc("src/app/(app)/library/vouchers/rm10/page.tsx");
assert.match(rm10Page, /canManageRm10PhysicalCards/);
assert.match(rm10Page, /redirect\("\/library\/vouchers"\)/);

// 1. Owner / 2. Manager can add one
const single = parseSingleVoucherNumber("100001");
assert.deepEqual(single, {
  voucherNumber: "100001",
  normalized: "100001",
});
const ownerPlan = planRm10PhysicalVoucherInserts(
  [single as { voucherNumber: string; normalized: string }],
  [],
);
assert.equal(ownerPlan.toCreate.length, 1);
assert.deepEqual(ownerPlan.toCreate[0], single);
assert.deepEqual(ownerPlan.alreadyExist, []);

const managerPlan = planRm10PhysicalVoucherInserts(
  [{ voucherNumber: "100002", normalized: "100002" }],
  [],
);
assert.equal(canManageRm10PhysicalCards("manager") && managerPlan.toCreate.length === 1, true);

// 3. Unauthorized roles cannot add
assert.equal(canManageRm10PhysicalCards("bakery"), false);
assert.equal(canManageRm10PhysicalCards("collection"), false);

// 4. Duplicate voucher number is rejected
const duplicatePlan = planRm10PhysicalVoucherInserts(
  [{ voucherNumber: "100001", normalized: "100001" }],
  ["100001"],
);
assert.deepEqual(duplicatePlan.toCreate, []);
assert.deepEqual(duplicatePlan.alreadyExist, ["100001"]);
assert.match(formatAlreadyExistMessage(["100001"]), /100001 already exists/);

// 5. Batch/range creation works
const range = parseVoucherNumberRange("100001", "100100");
assert.ok(Array.isArray(range));
assert.equal(range.length, 100);
assert.equal(range[0]?.voucherNumber, "100001");
assert.equal(range[99]?.voucherNumber, "100100");
assert.equal(
  parseVoucherNumberRange("A100", "A200"),
  RM10_RANGE_DIGITS_REQUIRED,
);

const list = parseVoucherNumberList("100001\n100002\n100003\n100004\n100005\n");
assert.ok(Array.isArray(list));
assert.equal(list.length, 5);

// 6. Existing records are not overwritten by batch creation
const batchPlan = planRm10PhysicalVoucherInserts(range as { voucherNumber: string; normalized: string }[], [
  "100001",
  "100050",
]);
assert.equal(batchPlan.toCreate.length, 98);
assert.deepEqual(batchPlan.alreadyExist, ["100001", "100050"]);
assert.equal(
  batchPlan.toCreate.some((item) => item.normalized === "100001"),
  false,
);

// 7–11 status
assert.equal(
  deriveRm10LibraryStatus({
    used: false,
    expiryDate: "2026-12-31",
    today: "2026-09-24",
  }),
  "available",
);
assert.equal(
  deriveRm10LibraryStatus({
    used: true,
    expiryDate: "2026-12-31",
    today: "2026-09-24",
  }),
  "used",
);
assert.equal(
  deriveRm10LibraryStatus({
    used: false,
    expiryDate: "2026-09-01",
    today: "2026-09-24",
  }),
  "expired",
);
assert.equal(
  deriveRm10LibraryStatus({
    used: true,
    expiryDate: "2026-09-01",
    today: "2026-09-24",
  }),
  "used",
);

const today = "2026-09-24";
const rows = buildRm10LibraryRows({
  today,
  managedCards: [
    {
      id: "card-available",
      voucherNumber: "200001",
      voucherNumberNormalized: "200001",
      expiryDate: "2026-12-31",
    },
    {
      id: "card-expired",
      voucherNumber: "200002",
      voucherNumberNormalized: "200002",
      expiryDate: "2026-08-01",
    },
    {
      id: "card-used-expired",
      voucherNumber: "200003",
      voucherNumberNormalized: "200003",
      expiryDate: "2026-08-01",
    },
    {
      id: "card-used",
      voucherNumber: "100002",
      voucherNumberNormalized: "100002",
      expiryDate: "2026-12-31",
    },
  ],
  redemptions: [
    redemption({
      adjustmentId: "adj-used",
      voucherNumber: "100002",
      orderId: "order-used",
      orderNumber: "WB1234",
      customerName: "John Tan",
    }),
    redemption({
      adjustmentId: "adj-used-expired",
      voucherNumber: "200003",
      orderNumber: "WB2003",
    }),
    redemption({
      adjustmentId: "adj-historical",
      voucherNumber: "300001",
      orderId: "order-hist",
      orderNumber: "WB3001",
      customerName: "Mei Ling",
    }),
    redemption({
      adjustmentId: "adj-dup-a",
      voucherNumber: "400001",
      orderNumber: "WB4001",
    }),
    redemption({
      adjustmentId: "adj-dup-b",
      voucherNumber: "400001",
      orderNumber: "WB4002",
      customerName: "Other Guest",
    }),
  ],
});

const byNumber = (number: string) =>
  rows.filter((row) => row.voucherNumberNormalized === number);

assert.equal(byNumber("200001")[0]?.status, "available");
assert.equal(byNumber("200001")[0]?.redemption, null);
assert.equal(byNumber("100002")[0]?.status, "used");
assert.equal(byNumber("100002")[0]?.source, "library");
assert.equal(byNumber("100002")[0]?.redemption?.orderNumber, "WB1234");
assert.equal(byNumber("300001")[0]?.status, "used");
assert.equal(byNumber("300001")[0]?.source, "historical");
assert.equal(byNumber("200002")[0]?.status, "expired");
assert.equal(byNumber("200002")[0]?.redemption, null);
assert.equal(byNumber("200003")[0]?.status, "used");
assert.equal(byNumber("400001").length, 2);
assert.equal(
  byNumber("400001").every((row) => row.duplicateRedemption),
  true,
);

// 12–15 search and filters
assert.equal(
  filterRm10LibraryRows(rows, { query: "100002" })[0]?.voucherNumber,
  "100002",
);
assert.equal(
  filterRm10LibraryRows(rows, { query: "WB3001" })[0]?.source,
  "historical",
);
assert.equal(
  filterRm10LibraryRows(rows, { query: "mei ling" })[0]?.voucherNumber,
  "300001",
);
assert.equal(filterRm10LibraryRows(rows, { status: "available" }).length, 1);
assert.equal(filterRm10LibraryRows(rows, { status: "expired" }).length, 1);
assert.ok(
  filterRm10LibraryRows(rows, { status: "used" }).every(
    (row) => row.status === "used",
  ),
);

const summary = summarizeRm10Library(rows);
assert.equal(summary.available, 1);
assert.equal(summary.expired, 1);
assert.equal(summary.used, 4);
assert.equal(summary.total, 6);
assert.equal(summary.usedValue, -50);

// 16. Used voucher links to the correct order
const usedDetail = findRm10LibraryRowsByNumber(rows, "100002");
assert.equal(usedDetail[0]?.redemption?.orderId, "order-used");
const detailPage = readSrc(
  "src/app/(app)/library/vouchers/rm10/[voucherNumber]/page.tsx",
);
assert.match(detailPage, /\/owner\/orders\/\$\{row\.redemption\.orderId\}/);
assert.match(detailPage, /View Order/);
assert.doesNotMatch(detailPage, /Mark as Used/);

// 17. Existing reusable voucher functionality still works
const catalogueQueries = readSrc("src/workspaces/library/vouchers/queries.ts");
const catalogueActions = readSrc("src/workspaces/library/vouchers/actions.ts");
const cataloguePage = readSrc("src/app/(app)/library/vouchers/page.tsx");
assert.match(catalogueQueries, /from\("library_vouchers"\)/);
assert.match(catalogueActions, /createVoucherAction/);
assert.match(catalogueActions, /updateVoucherAction/);
assert.match(catalogueActions, /deleteVoucherAction/);
assert.match(catalogueActions, /from\("library_vouchers"\)/);
assert.match(cataloguePage, /VoucherDirectory/);
assert.match(cataloguePage, /canManageLibrary/);
assert.doesNotMatch(catalogueActions, /physical_discount_vouchers/);
assert.doesNotMatch(catalogueQueries, /rm10_physical_card/);

// 18. Existing RM10 redemption logic remains untouched
const redeemMigration = readSrc(
  "supabase/migrations/20260807200000_milestone3_discounts_adjustments.sql",
);
assert.match(
  redeemMigration,
  /create or replace function public.redeem_rm10_physical_voucher_for_guest_order/,
);
assert.match(redeemMigration, /c_code constant text := 'rm10_physical_card'/);
assert.match(redeemMigration, /'voucher_number', v_number/);

const libraryMigration = readSrc(
  "supabase/migrations/20260924150000_rm10_physical_voucher_library.sql",
);
assert.match(libraryMigration, /library_managed/);
assert.match(libraryMigration, /_current_staff_role_code\(\) in \('owner', 'manager'\)/);
assert.doesNotMatch(
  libraryMigration,
  /create or replace function public.redeem_rm10_physical_voucher_for_guest_order/,
);
assert.doesNotMatch(
  libraryMigration,
  /create or replace function public.change_august_promo_to_rm10_physical_voucher/,
);
assert.doesNotMatch(libraryMigration, /create table public.rm10_physical_vouchers/);

const ownerDiscountActions = readSrc("src/workspaces/owner/orders/actions.ts");
assert.match(
  ownerDiscountActions,
  /redeem_rm10_physical_voucher_for_guest_order/,
);

const preserveExpiryMigration = readSrc(
  "supabase/migrations/20260924170000_preserve_library_rm10_expiry.sql",
);
assert.match(
  preserveExpiryMigration,
  /when v\.library_managed then v\.expiry_date/,
);
assert.match(
  preserveExpiryMigration,
  /when v\.library_managed then v\.voucher_number/,
);
assert.match(preserveExpiryMigration, /Owner Override is unchanged/);
assert.match(preserveExpiryMigration, /p_expiry_date,/);
assert.match(preserveExpiryMigration, /'unredeemed'/);
assert.doesNotMatch(
  preserveExpiryMigration,
  /update public\.physical_discount_vouchers v\n\s+set\n\s+expiry_date = p_expiry_date/,
);

const authoritativeExpiryMigration = readSrc(
  "supabase/migrations/20260924180000_authoritative_library_rm10_expiry.sql",
);
assert.match(
  authoritativeExpiryMigration,
  /Library-managed original expiry is authoritative/,
);
assert.match(
  authoritativeExpiryMigration,
  /singapore_calendar_date\(now\(\)\) > voucher_row\.expiry_date/,
);
assert.match(
  authoritativeExpiryMigration,
  /when v\.library_managed then v\.expiry_date/,
);
assert.match(authoritativeExpiryMigration, /registered_expiry_date/);
assert.match(authoritativeExpiryMigration, /v_found := found/);
assert.doesNotMatch(
  authoritativeExpiryMigration,
  /create table public\.rm10_physical_vouchers/,
);

const directorySrc = readSrc(
  "src/workspaces/library/vouchers/rm10/Rm10PhysicalDirectory.tsx",
);
const detailSrc = readSrc(
  "src/app/(app)/library/vouchers/rm10/[voucherNumber]/page.tsx",
);
assert.match(directorySrc, /Original Expiry/);
assert.match(directorySrc, /Used after expiry/);
assert.match(detailSrc, /Original Expiry/);
assert.match(detailSrc, /Used after expiry/);
assert.match(detailSrc, /Override Date/);
assert.match(detailSrc, /Override By/);

// CASE A — unexpired managed voucher: no override, original expiry unchanged
assert.equal(
  evaluateRegisteredPhysicalRm10Expiry({
    registeredExpiry: "2026-12-31",
    today: "2026-09-24",
    orderDate: "2026-09-24",
    pickupDate: "2026-09-30",
  }).expired,
  false,
);
const caseA = buildRm10LibraryRows({
  today: "2026-09-24",
  managedCards: [
    {
      id: "card-3001",
      voucherNumber: "3001",
      voucherNumberNormalized: "3001",
      expiryDate: "2026-12-31",
    },
  ],
  redemptions: [
    redemption({
      adjustmentId: "adj-3001",
      voucherNumber: "3001",
      expiryDate: "2026-10-09",
      orderNumber: "WB3001A",
      redeemedDate: "2026-09-24",
      ownerOverride: false,
    }),
  ],
});
assert.equal(caseA.length, 1);
assert.equal(caseA[0]?.status, "used");
assert.equal(caseA[0]?.source, "library");
assert.equal(caseA[0]?.usedAfterExpiry, false);
assert.equal(caseA[0]?.expiryDate, "2026-12-31");
assert.equal(caseA[0]?.redemption?.ownerOverride, false);

// CASE B — expired managed voucher + future form expiry is still expired
const caseBExpiry = evaluateRegisteredPhysicalRm10Expiry({
  registeredExpiry: "2026-07-31",
  today: "2026-09-24",
  orderDate: "2026-09-24",
  pickupDate: "2026-10-09",
});
assert.equal(caseBExpiry.expired, true);
assert.match(caseBExpiry.reason ?? "", /expired|after voucher expiry/i);
const caseB = buildRm10LibraryRows({
  today: "2026-09-24",
  managedCards: [
    {
      id: "card-3002",
      voucherNumber: "3002",
      voucherNumberNormalized: "3002",
      expiryDate: "2026-07-31",
    },
  ],
  redemptions: [
    redemption({
      adjustmentId: "adj-3002",
      voucherNumber: "3002",
      expiryDate: "2026-10-09",
      orderNumber: "WB3002B",
    }),
  ],
});
assert.equal(caseB[0]?.status, "used");
assert.equal(caseB[0]?.expiryDate, "2026-07-31");
assert.notEqual(caseB[0]?.expiryDate, caseB[0]?.redemption?.expiryDate);

// CASE C — expired managed voucher without override stays expired in library
const caseC = buildRm10LibraryRows({
  today: "2026-09-24",
  managedCards: [
    {
      id: "card-3003",
      voucherNumber: "3003",
      voucherNumberNormalized: "3003",
      expiryDate: "2026-07-31",
    },
  ],
  redemptions: [],
});
assert.equal(caseC[0]?.status, "expired");
assert.equal(caseC[0]?.expiryDate, "2026-07-31");
assert.equal(caseC[0]?.usedAfterExpiry, false);
assert.equal(caseC[0]?.redemption, null);

// CASE D — expired managed voucher WITH Owner Override
assert.equal(
  isRm10UsedAfterExpiry({
    ownerOverride: true,
    originalExpiry: "2026-07-31",
    redeemedDate: "2026-09-24",
    orderDate: "2026-09-24",
  }),
  true,
);
const caseD = buildRm10LibraryRows({
  today: "2026-09-24",
  managedCards: [
    {
      id: "card-3004",
      voucherNumber: "3004",
      voucherNumberNormalized: "3004",
      expiryDate: "2026-07-31",
    },
  ],
  redemptions: [
    redemption({
      adjustmentId: "adj-3004",
      voucherNumber: "3004",
      expiryDate: "2026-10-09",
      orderNumber: "WB3004D",
      orderDate: "2026-09-24",
      redeemedDate: "2026-09-24",
      ownerOverride: true,
      overrideByName: "Owner",
    }),
  ],
});
assert.equal(caseD[0]?.status, "used");
assert.equal(caseD[0]?.expiryDate, "2026-07-31");
assert.equal(caseD[0]?.usedAfterExpiry, true);
assert.equal(caseD[0]?.redemption?.ownerOverride, true);
assert.equal(caseD[0]?.redemption?.overrideByName, "Owner");
assert.equal(caseD[0]?.redemption?.orderNumber, "WB3004D");

// CASE E — Owner cannot silently override
const discountPanel = readSrc(
  "src/workspaces/owner/orders/OrderDiscountsPanel.tsx",
);
const expiredNotice = readSrc(
  "src/workspaces/owner/orders/RegisteredRm10ExpiredNotice.tsx",
);
assert.match(expiredNotice, /Voucher Expired/);
assert.match(expiredNotice, /This physical voucher expired on/);
assert.match(expiredNotice, /Using it requires Owner Override/);
assert.match(expiredNotice, /Use Owner Override/);
assert.match(discountPanel, /expiredOverrideConfirmed/);
assert.match(discountPanel, /setExpiredOverrideConfirmed\(true\)/);
assert.match(discountPanel, /setOwnerOverride\(false\)/);
assert.doesNotMatch(discountPanel, /setOwnerOverride\(true\);\n\s*setShowRm10Form/);
assert.match(
  readSrc("src/workspaces/owner/orders/actions.ts"),
  /rejectExpiredManagedRm10WithoutOverride/,
);

// CASE F — form expiry cannot mutate library expiry
const caseF = buildRm10LibraryRows({
  today: "2026-09-24",
  managedCards: [
    {
      id: "card-3005",
      voucherNumber: "3005",
      voucherNumberNormalized: "3005",
      expiryDate: "2026-07-31",
    },
  ],
  redemptions: [
    redemption({
      adjustmentId: "adj-3005",
      voucherNumber: "3005",
      expiryDate: "2026-10-09",
    }),
  ],
});
assert.equal(caseF[0]?.expiryDate, "2026-07-31");
assert.equal(caseF[0]?.redemption?.expiryDate, "2026-10-09");

// CASE G — unregistered/historical redemption still appears without a managed row
const caseG = buildRm10LibraryRows({
  today: "2026-09-24",
  managedCards: [],
  redemptions: [
    redemption({
      adjustmentId: "adj-hist-213",
      voucherNumber: "213",
      expiryDate: "2026-10-09",
      orderNumber: "WB213C",
    }),
  ],
});
assert.equal(caseG.length, 1);
assert.equal(caseG[0]?.source, "historical");
assert.equal(caseG[0]?.status, "used");
assert.equal(caseG[0]?.expiryDate, "2026-10-09");
assert.equal(caseG[0]?.usedAfterExpiry, false);

// 19. Existing voucher validation still works
assert.equal(
  evaluateRm10CardEligibility({
    items: [{ sizeLabel: '6"' }],
    orderDate: "2026-09-18",
    pickupDate: "2026-09-25",
    expiryDate: "2026-12-31",
    hasAugustPromo: false,
    hasRm10Card: false,
    hasVerifiedPayments: false,
    orderStatus: "submitted",
  }).eligible,
  true,
);
assert.equal(
  evaluateRm10CardRuleFit({
    items: [{ sizeLabel: '4"' }],
    orderDate: "2026-09-18",
    pickupDate: "2026-09-25",
    expiryDate: "2026-12-31",
  }).reason,
  'RM10 Discount Card requires a 6" or 8" cake on the order.',
);
assert.equal(
  physicalVoucherNumberFromMetadata({ voucher_number: " 100002 " }),
  "100002",
);
assert.deepEqual(
  getEffectiveAdjustments([
    { status: "active", reversesAdjustmentId: null },
    { status: "reversed", reversesAdjustmentId: null },
    { status: "active", reversesAdjustmentId: "adj-1" },
  ]).map((row) => row.status),
  ["active"],
);

assert.equal(normalizePhysicalVoucherNumber(" 10 0001 "), "100001");
assert.equal(normalizePhysicalVoucherNumber("   "), null);
assert.equal(normalizePhysicalVoucherNumber("0123"), "123");
assert.equal(normalizePhysicalVoucherNumber("123"), "123");
assert.equal(normalizePhysicalVoucherNumber("000123"), "123");
assert.equal(normalizePhysicalVoucherNumber("000"), null);
assert.equal(parseSingleVoucherNumber("WB0123"), RM10_VOUCHER_DIGITS_REQUIRED);
assert.equal(parseSingleVoucherNumber("0123")?.normalized, "123");
assert.equal(
  typeof parseSingleVoucherNumber("0123") === "object"
    ? parseSingleVoucherNumber("0123").voucherNumber
    : "",
  "0123",
);

const leadingZeroDuplicate = planRm10PhysicalVoucherInserts(
  [parseSingleVoucherNumber("0123") as { voucherNumber: string; normalized: string }],
  ["123"],
);
assert.deepEqual(leadingZeroDuplicate.toCreate, []);
assert.deepEqual(leadingZeroDuplicate.alreadyExist, ["0123"]);

const reverseLeadingZeroDuplicate = planRm10PhysicalVoucherInserts(
  [parseSingleVoucherNumber("123") as { voucherNumber: string; normalized: string }],
  ["0123"],
);
assert.deepEqual(reverseLeadingZeroDuplicate.toCreate, []);

const paddedRange = parseVoucherNumberRange("0123", "0127");
assert.ok(Array.isArray(paddedRange));
assert.deepEqual(
  paddedRange.map((item) => item.voucherNumber),
  ["0123", "0124", "0125", "0126", "0127"],
);
assert.deepEqual(
  paddedRange.map((item) => item.normalized),
  ["123", "124", "125", "126", "127"],
);

const pastedZeros = parseVoucherNumberList("0123\n123\n000123");
assert.ok(Array.isArray(pastedZeros));
assert.equal(pastedZeros.length, 1);
assert.equal(pastedZeros[0]?.normalized, "123");

assert.equal(
  findRm10LibraryRowsByNumber(
    buildRm10LibraryRows({
      today: "2026-09-24",
      managedCards: [
        {
          id: "card-123",
          voucherNumber: "0123",
          voucherNumberNormalized: "0123",
          expiryDate: "2026-12-31",
        },
      ],
      redemptions: [
        redemption({
          adjustmentId: "adj-123",
          voucherNumber: "123",
          orderNumber: "WB0123-MATCH",
        }),
      ],
    }),
    "0123",
  )[0]?.status,
  "used",
);

const engineSrc = readSrc("src/engines/vouchers/physical-rm10.ts");
assert.doesNotMatch(engineSrc, /`WB\$\{/);
assert.doesNotMatch(engineSrc, /voucherNumber = `WB/);
assert.match(engineSrc, /Do not add a prefix/);

const identityMigration = readSrc(
  "supabase/migrations/20260924160000_rm10_voucher_number_numeric_identity.sql",
);
assert.match(identityMigration, /normalize_physical_voucher_number/);
assert.match(identityMigration, /regexp_replace\(compact, '\^0\+', ''\)/);
assert.doesNotMatch(
  identityMigration,
  /create or replace function public.redeem_rm10_physical_voucher_for_guest_order/,
);

const tabs = readSrc("src/workspaces/library/vouchers/VoucherLibraryTabs.tsx");
assert.match(tabs, /All Vouchers/);
assert.match(tabs, /RM10 Physical Cards/);
assert.doesNotMatch(tabs, /RM10 Voucher Usage/);

console.log("test-voucher-library-rm10: ok");
