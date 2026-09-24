/**
 * Staff overpayment / refund correction.
 * Run: npx tsx scripts/test-payment-correction.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildGuestOrderWorkspaceCapabilities } from "@/engines/orders/delivery-finance-capabilities";
import {
  PAYMENT_CORRECTION_INVALID_AMOUNT,
  PAYMENT_CORRECTION_NO_EXCESS,
  PAYMENT_CORRECTION_NO_PAYMENT,
  PAYMENT_CORRECTION_STATUS_LABEL,
  PAYMENT_CORRECTION_TYPE,
  parseRefundAmount,
  paymentCorrectionStatus,
  remainingRefundableExcess,
  validatePaymentCorrection,
} from "@/engines/orders/payment-correction";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import { moneyCompare } from "@/engines/orders/money";

function settle(input: {
  due: number;
  received: number;
  refunds?: number[];
  processingFee?: number;
}) {
  const processingFee = input.processingFee ?? 0;
  return calculateOrderSettlement({
    items: [{ unitPrice: input.due - processingFee, quantity: 1 }],
    adjustments:
      processingFee > 0
        ? [{ amount: processingFee }]
        : [],
    allocations:
      input.received > 0
        ? [{ amount: input.received, paymentStatus: "verified" }]
        : [],
    refunds: (input.refunds ?? []).map((amount) => ({
      amount,
      status: "recorded" as const,
    })),
  });
}

// 1. No overpayment
const even = settle({ due: 100, received: 100 });
assert.equal(even.amountDue, 100);
assert.equal(even.verifiedPaymentsAllocated, 100);
assert.equal(remainingRefundableExcess(even), 0);
assert.equal(paymentCorrectionStatus(even), "none");
assert.equal(PAYMENT_CORRECTION_STATUS_LABEL.none, "No correction");
assert.equal(
  validatePaymentCorrection({ settlement: even, amount: 1 }).error,
  PAYMENT_CORRECTION_NO_EXCESS,
);

// 2. Overpayment
const over = settle({ due: 100, received: 120 });
assert.equal(over.overpayment, 20);
assert.equal(remainingRefundableExcess(over), 20);
assert.equal(paymentCorrectionStatus(over), "none");

// 3. Partial refund
const partial = settle({ due: 100, received: 120, refunds: [10] });
assert.equal(partial.verifiedPaymentsAllocated, 120);
assert.equal(partial.refundsTotal, 10);
assert.equal(partial.netReceived, 110);
assert.equal(partial.overpayment, 10);
assert.equal(remainingRefundableExcess(partial), 10);
assert.equal(paymentCorrectionStatus(partial), "partial");
assert.equal(PAYMENT_CORRECTION_STATUS_LABEL.partial, "Partially refunded");

// 4. Full refund of excess
const full = settle({ due: 100, received: 120, refunds: [20] });
assert.equal(full.refundsTotal, 20);
assert.equal(full.overpayment, 0);
assert.equal(full.netReceived, 100);
assert.equal(full.isFullyPaid, true);
assert.equal(remainingRefundableExcess(full), 0);
assert.equal(paymentCorrectionStatus(full), "full");
assert.equal(PAYMENT_CORRECTION_STATUS_LABEL.full, "Fully refunded");
assert.equal(
  validatePaymentCorrection({ settlement: full, amount: 1 }).error,
  PAYMENT_CORRECTION_NO_EXCESS,
);

// 5. Cannot refund more than remaining excess
assert.match(
  validatePaymentCorrection({ settlement: over, amount: 20.01 }).error ?? "",
  /cannot exceed/,
);
assert.match(
  validatePaymentCorrection({ settlement: partial, amount: 10.01 }).error ?? "",
  /cannot exceed/,
);

// 6. Cannot create negative / zero refund amounts
assert.equal(parseRefundAmount("-1"), null);
assert.equal(parseRefundAmount("0"), null);
assert.equal(parseRefundAmount("   "), null);
assert.equal(
  validatePaymentCorrection({ settlement: over, amount: -5 }).error,
  PAYMENT_CORRECTION_INVALID_AMOUNT,
);
assert.equal(
  validatePaymentCorrection({ settlement: over, amount: 0 }).error,
  PAYMENT_CORRECTION_INVALID_AMOUNT,
);

// 7. Cannot refund without a valid payment basis
const unpaid = settle({ due: 100, received: 0 });
assert.equal(
  validatePaymentCorrection({ settlement: unpaid, amount: 10 }).error,
  PAYMENT_CORRECTION_NO_PAYMENT,
);
const under = settle({ due: 100, received: 80 });
assert.equal(under.overpayment, 0);
assert.equal(
  validatePaymentCorrection({ settlement: under, amount: 10 }).error,
  PAYMENT_CORRECTION_NO_EXCESS,
);

// 8. Historical payment amount remains unchanged after corrections
assert.equal(partial.verifiedPaymentsAllocated, 120);
assert.equal(full.verifiedPaymentsAllocated, 120);
assert.equal(over.verifiedPaymentsAllocated, 120);

// 9–10. Unauthorized vs Owner/Manager
const owner = buildGuestOrderWorkspaceCapabilities({
  role: "owner",
  staffId: "owner-1",
});
const manager = buildGuestOrderWorkspaceCapabilities({
  role: "manager",
  staffId: "mgr-1",
});
const counter = buildGuestOrderWorkspaceCapabilities({
  role: "customer_operations",
  staffId: "vivian-1",
});
const bakery = buildGuestOrderWorkspaceCapabilities({
  role: "bakery",
  staffId: "bakery-1",
});
assert.equal(owner.canRecordPaymentCorrection, true);
assert.equal(manager.canRecordPaymentCorrection, true);
assert.equal(counter.canRecordPaymentCorrection, false);
assert.equal(bakery.canRecordPaymentCorrection, false);
assert.equal(counter.canRecordPayment, true);

// 11. Preview retains actor-ready correction facts
const preview = validatePaymentCorrection({ settlement: over, amount: 10 });
assert.equal(preview.error, null);
assert.ok(preview.preview);
assert.equal(preview.preview.correctionType, PAYMENT_CORRECTION_TYPE);
assert.equal(preview.preview.paymentReceived, 120);
assert.equal(preview.preview.orderAmount, 100);
assert.equal(preview.preview.refundAmount, 10);
assert.equal(preview.preview.remainingExcessAfter, 10);

// 12. Repeated corrections stay accurate
const afterFirst = settle({ due: 100, received: 120, refunds: [10] });
const second = validatePaymentCorrection({ settlement: afterFirst, amount: 10 });
assert.equal(second.error, null);
assert.ok(second.preview);
assert.equal(second.preview.remainingExcessAfter, 0);
const afterBoth = settle({ due: 100, received: 120, refunds: [10, 10] });
assert.equal(afterBoth.refundsTotal, 20);
assert.equal(afterBoth.overpayment, 0);
assert.equal(
  validatePaymentCorrection({ settlement: afterBoth, amount: 1 }).error,
  PAYMENT_CORRECTION_NO_EXCESS,
);

// 13. Delivery processing fee stays a separate adjustment
const withFee = settle({ due: 105, received: 125, processingFee: 5 });
assert.equal(withFee.subtotal, 100);
assert.equal(withFee.totalAdjustments, 5);
assert.equal(withFee.amountDue, 105);
assert.equal(withFee.overpayment, 20);
assert.equal(withFee.verifiedPaymentsAllocated, 125);
const feeAfter = settle({
  due: 105,
  received: 125,
  processingFee: 5,
  refunds: [20],
});
assert.equal(feeAfter.totalAdjustments, 5);
assert.equal(feeAfter.amountDue, 105);
assert.equal(feeAfter.verifiedPaymentsAllocated, 125);
assert.equal(feeAfter.overpayment, 0);
assert.equal(moneyCompare(feeAfter.totalAdjustments, 5), 0);

// 14–15. Existing payment confirmation / checkout files untouched
const paymentAction = readFileSync(
  resolve(process.cwd(), "src/workspaces/owner/orders/actions.ts"),
  "utf8",
);
assert.match(paymentAction, /record_and_verify_guest_order_payment/);
assert.match(paymentAction, /recordOverpaymentRefundAction/);
assert.match(paymentAction, /requireOwnerOrManager/);
assert.match(paymentAction, /record_overpayment_refund/);
assert.doesNotMatch(paymentAction, /from\("refunds"\)\.insert/);
assert.doesNotMatch(
  paymentAction.split("recordOverpaymentRefundAction")[1] ?? "",
  /\.update\([\s\S]*payments/,
);

const checkout = readFileSync(
  resolve(process.cwd(), "src/workspaces/storefront/checkout/actions.ts"),
  "utf8",
);
assert.doesNotMatch(checkout, /recordOverpaymentRefundAction/);
assert.doesNotMatch(checkout, /storefront_faq_items/);

const paymentSection = readFileSync(
  resolve(process.cwd(), "src/workspaces/owner/orders/PaymentSection.tsx"),
  "utf8",
);
assert.match(paymentSection, /Record refund/);
assert.match(paymentSection, /RecordRefundForm/);
assert.match(paymentSection, /canRecordPaymentCorrection/);
assert.match(paymentSection, /verifiedPaymentsAllocated/);
assert.doesNotMatch(paymentSection, /refund\/correction is a separate workflow/);

const refundForm = readFileSync(
  resolve(process.cwd(), "src/workspaces/owner/orders/RecordRefundForm.tsx"),
  "utf8",
);
assert.match(refundForm, /Confirm this correction/);
assert.match(refundForm, /Remaining excess/);
assert.match(refundForm, /does not send money through a/);

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260923140000_payment_correction_refunds.sql",
  ),
  "utf8",
);
assert.match(migration, /_current_staff_role_code\(\) in \('owner', 'manager'\)/);
assert.match(migration, /assert_refund_within_overpayment/);
assert.doesNotMatch(migration, /for delete/);
assert.doesNotMatch(migration, /for update/);

const atomicMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260924120000_record_overpayment_refund_atomic.sql",
  ),
  "utf8",
);
assert.match(atomicMigration, /record_overpayment_refund/);
assert.match(atomicMigration, /_bind_rpc_actor/);
assert.match(atomicMigration, /_require_rpc_roles/);
assert.match(atomicMigration, /array\['owner', 'manager'\]/);
assert.match(atomicMigration, /security definer/i);
assert.match(atomicMigration, /set search_path = public/);
assert.match(atomicMigration, /insert into public.refunds/);
assert.match(atomicMigration, /insert into public.order_timeline_events/);
assert.match(atomicMigration, /payment_correction_recorded/);
assert.match(atomicMigration, /drop policy if exists refunds_authenticated_insert/);
assert.doesNotMatch(atomicMigration, /\bexception\s+when\b/i);
assert.doesNotMatch(atomicMigration, /autonomous transaction/i);
const refundActionSrc =
  paymentAction.split("export async function recordOverpaymentRefundAction")[1]?.split(
    "export async function applyAugustPromoAction",
  )[0] ?? "";
assert.match(refundActionSrc, /record_overpayment_refund/);
assert.doesNotMatch(refundActionSrc, /from\("refunds"\)\.insert/);
assert.doesNotMatch(refundActionSrc, /from\("order_timeline_events"\)\.insert/);
assert.doesNotMatch(refundActionSrc, /insertTimelineEvent/);
assert.match(paymentAction, /validatePaymentCorrection/);
assert.match(paymentAction, /requireOwnerOrManager/);
assert.equal(
  existsSync(
    resolve(process.cwd(), "scripts/test-payment-correction-atomic-live.ts"),
  ),
  true,
);

console.log("test-payment-correction: ok");
