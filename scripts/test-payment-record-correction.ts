import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { reconcilePaymentLifecycleStatus } from "../src/engines/orders/payment-status";
import { calculateOrderSettlement } from "../src/engines/orders/settlement";
import {
  parseCorrectedPaymentAmount,
  normalizePaymentMethodDescription,
  validatePaymentCorrection,
} from "../src/engines/orders/payment-record-correction";

const migrationPath =
  "supabase/migrations/20261005043951_payment_correction_v1.sql";
const migration = readFileSync(resolve(process.cwd(), migrationPath), "utf8");
const enumFixMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261005061453_fix_payment_correction_payment_status_enum.sql",
  ),
  "utf8",
);
const paymentSection = readFileSync(
  resolve(process.cwd(), "src/workspaces/owner/orders/PaymentSection.tsx"),
  "utf8",
);
const paymentForm = readFileSync(
  resolve(
    process.cwd(),
    "src/workspaces/owner/orders/RecordPaymentCorrectionForm.tsx",
  ),
  "utf8",
);
const actions = readFileSync(
  resolve(process.cwd(), "src/workspaces/owner/orders/actions.ts"),
  "utf8",
);
const timeline = readFileSync(
  resolve(process.cwd(), "src/engines/orders/timeline.ts"),
  "utf8",
);

const base = {
  originalAmount: 141,
  originalMethod: "online_transfer" as const,
  originalMethodDescription: null,
  reason: "Crew entered the wrong payment details",
};

// A. Method-only correction preserves amount and selects the method type.
const methodOnly = validatePaymentCorrection({
  ...base,
  correctedAmount: 141,
  correctedMethod: "wb_qr",
  correctedMethodDescription: "",
});
assert.equal(methodOnly.error, null);
assert.equal(methodOnly.correctionType, "method");

// B. Amount-only correction.
const amountOnly = validatePaymentCorrection({
  ...base,
  correctedAmount: 140,
  correctedMethod: "online_transfer",
  correctedMethodDescription: null,
});
assert.equal(amountOnly.error, null);
assert.equal(amountOnly.correctionType, "amount");

// C. Combined correction.
const combined = validatePaymentCorrection({
  ...base,
  correctedAmount: 140,
  correctedMethod: "wb_qr",
  correctedMethodDescription: null,
});
assert.equal(combined.error, null);
assert.equal(combined.correctionType, "combined");

// D. Others requires description.
const missingOthers = validatePaymentCorrection({
  ...base,
  correctedAmount: 140,
  correctedMethod: "others",
  correctedMethodDescription: "  ",
});
assert.match(missingOthers.error ?? "", /description is required/i);
assert.equal(normalizePaymentMethodDescription("others", "  Cash  "), "Cash");

// E. Non-Others descriptions are discarded.
assert.equal(normalizePaymentMethodDescription("wb_qr", "ignored"), null);
assert.equal(parseCorrectedPaymentAmount("0"), 0);

// F. No-op rejected; reason required.
const noOp = validatePaymentCorrection({
  originalAmount: 141,
  correctedAmount: 141,
  originalMethod: "online_transfer",
  originalMethodDescription: null,
  correctedMethod: "online_transfer",
  correctedMethodDescription: null,
  reason: "No change",
});
assert.match(noOp.error ?? "", /change the amount or payment method/i);
const missingReason = validatePaymentCorrection({
  ...base,
  correctedAmount: 140,
  correctedMethod: "online_transfer",
  correctedMethodDescription: null,
  reason: "  ",
});
assert.match(missingReason.error ?? "", /reason/i);

function settle(amount: number, effectiveAmount?: number) {
  return calculateOrderSettlement({
    items: [{ unitPrice: 140, quantity: 1 }],
    adjustments: [],
    allocations: [
      {
        amount,
        effectiveAmount,
        paymentStatus: "verified",
      },
    ],
    refunds: [],
  });
}

// N. Fully covered after correcting 141 to 140.
const exactPaid = settle(141, 140);
assert.equal(exactPaid.verifiedPaymentsAllocated, 140);
assert.equal(exactPaid.netReceived, 140);
assert.equal(exactPaid.remainingBalance, 0);
assert.equal(exactPaid.overpayment, 0);
assert.equal(exactPaid.isFullyPaid, true);
assert.equal(
  reconcilePaymentLifecycleStatus({
    previousStatus: "awaiting_payment",
    previousNetReceived: 0,
    settlement: exactPaid,
  }).newStatus,
  "paid",
);

// O. Corrected amount below due restores the balance and awaiting-payment state.
const underpaid = settle(141, 139);
assert.equal(underpaid.verifiedPaymentsAllocated, 139);
assert.equal(underpaid.remainingBalance, 1);
assert.equal(underpaid.overpayment, 0);
assert.equal(
  reconcilePaymentLifecycleStatus({
    previousStatus: "paid",
    previousNetReceived: 141,
    settlement: underpaid,
  }).newStatus,
  "awaiting_payment",
);

// P. An uncorrected genuine overpayment remains an overpayment.
const genuineOverpayment = settle(141);
assert.equal(genuineOverpayment.verifiedPaymentsAllocated, 141);
assert.equal(genuineOverpayment.overpayment, 1);

// Q. Method-only correction supplies the same amount to settlement.
const methodOnlySettlement = settle(141, 141);
assert.equal(methodOnlySettlement.verifiedPaymentsAllocated, 141);
assert.equal(methodOnlySettlement.remainingBalance, 0);
assert.equal(methodOnlySettlement.overpayment, 1);

// G/H/I/J/K/L/M/R/S. The database RPC is the security/atomicity boundary.
assert.match(migration, /array\['owner',\s*'manager'\]::text\[\]/);
assert.doesNotMatch(migration, /array\[[^\]]*customer_operations/i);
assert.match(migration, /for update/i);
assert.match(
  migration,
  /payment_corrections_one_per_payment unique \(payment_id\)/i,
);
assert.match(
  migration,
  /payment_corrections_authenticated_select[\s\S]*using \(public\._current_staff_role_code\(\) is not null\)/i,
);
assert.match(migration, /Shared payments cannot be corrected/i);
assert.match(migration, /already been corrected/i);
assert.match(migration, /Cannot correct payment on a cancelled order/i);
assert.match(migration, /with recorded refunds cannot be corrected/i);
assert.match(migration, /payment_corrections.*unique/i);
assert.match(
  migration,
  /order_verified_allocated[\s\S]*coalesce\(pc\.corrected_amount, pa\.amount\)/i,
);
assert.match(
  migration,
  /insert into public\.payment_corrections[\s\S]*insert into public\.order_timeline_events[\s\S]*'payment_corrected'/i,
);
assert.match(
  migration,
  /payment_corrections_immutable[\s\S]*before update or delete/i,
);
assert.match(
  migration,
  /revoke all on table public\.payment_corrections from public, anon, authenticated/i,
);
assert.match(
  migration,
  /grant execute on function public\.record_payment_correction[\s\S]*to authenticated, service_role/i,
);
assert.match(
  migration,
  /when o\.status in \('awaiting_payment', 'paid'\) then v_new_status[\s\S]*else o\.status/i,
);
assert.doesNotMatch(
  migration,
  /update public\.(payments|payment_allocations)/i,
);
assert.match(enumFixMigration, /pg_get_functiondef/i);
assert.match(enumFixMigration, /''paid''::public\.payment_status/);
assert.match(enumFixMigration, /''unpaid''::public\.payment_status/);
assert.match(
  enumFixMigration,
  /Expected Payment Correction payment_status expression was not found/,
);

// Settlement projection and Owner UI keep original and effective history distinct.
assert.match(
  actions,
  /correctPaymentRecordAction[\s\S]*record_payment_correction/,
);
assert.match(paymentSection, /Correct Payment/);
assert.match(paymentForm, />Original<\/dt>[\s\S]*>Corrected<\/dt>/);
assert.match(paymentForm, /not a refund/i);
assert.match(paymentSection, /Effective payment/);
assert.match(timeline, /payment_corrected: "Payment corrected"/);

// T. Existing overpayment refund path remains in place and separate.
assert.match(paymentSection, /RecordRefundForm/);
assert.match(
  actions,
  /recordOverpaymentRefundAction[\s\S]*record_overpayment_refund/,
);
assert.doesNotMatch(
  migration,
  /create or replace function public\.record_overpayment_refund/i,
);

console.log("test-payment-record-correction: ok");
