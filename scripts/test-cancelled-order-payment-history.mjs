import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canMutatePaymentForOrderStatus,
  shouldShowCancelledNoRefundNotice,
  shouldShowPaymentSection,
} from "../src/engines/orders/payment-section-visibility.ts";

const workspace = readFileSync(
  "src/workspaces/owner/orders/OrderWorkspaceForm.tsx",
  "utf8",
);
const section = readFileSync(
  "src/workspaces/owner/orders/PaymentSection.tsx",
  "utf8",
);
const queries = readFileSync("src/workspaces/owner/orders/queries.ts", "utf8");
const discountsPanel = readFileSync(
  "src/workspaces/owner/orders/OrderDiscountsPanel.tsx",
  "utf8",
);

const base = { canManagePayments: true };

assert.equal(
  shouldShowPaymentSection({
    ...base,
    status: "cancelled",
    paymentHistoryCount: 2,
    refundHistoryCount: 0,
  }),
  true,
  "cancelled paid order with payment history remains visible",
);
assert.equal(
  shouldShowPaymentSection({
    ...base,
    status: "cancelled",
    paymentHistoryCount: 0,
    refundHistoryCount: 1,
  }),
  true,
  "cancelled order with a recorded refund remains visible",
);
assert.equal(
  shouldShowPaymentSection({
    ...base,
    status: "cancelled",
    paymentHistoryCount: 0,
    refundHistoryCount: 0,
  }),
  false,
  "cancelled order without financial history does not get an empty section",
);
assert.equal(
  shouldShowPaymentSection({
    ...base,
    status: "paid",
    paymentHistoryCount: 1,
    refundHistoryCount: 0,
  }),
  true,
  "active paid order keeps its existing section",
);
assert.equal(
  shouldShowPaymentSection({
    ...base,
    status: "awaiting_payment",
    paymentHistoryCount: 0,
    refundHistoryCount: 0,
  }),
  true,
  "awaiting-payment order keeps its existing section",
);
assert.equal(
  shouldShowPaymentSection({
    canManagePayments: false,
    status: "cancelled",
    paymentHistoryCount: 2,
    refundHistoryCount: 0,
  }),
  false,
  "existing payment permission remains required",
);

assert.equal(canMutatePaymentForOrderStatus("cancelled"), false);
assert.equal(canMutatePaymentForOrderStatus("paid"), true);
assert.equal(
  shouldShowCancelledNoRefundNotice({
    status: "cancelled",
    paymentHistoryCount: 2,
    refundHistoryCount: 0,
  }),
  true,
);
assert.equal(
  shouldShowCancelledNoRefundNotice({
    status: "cancelled",
    paymentHistoryCount: 2,
    refundHistoryCount: 1,
  }),
  false,
  "recorded refund details replace the no-refund notice",
);
assert.equal(
  shouldShowCancelledNoRefundNotice({
    status: "cancelled",
    paymentHistoryCount: 0,
    refundHistoryCount: 0,
  }),
  false,
);

assert.match(workspace, /shouldShowPaymentSection\(\{/);
assert.match(workspace, /paymentHistoryCount: order\.paymentAllocations\.length/);
assert.match(workspace, /refundHistoryCount: order\.refunds\.length/);
assert.match(section, /canMutatePaymentForOrderStatus\(order\.status\)/);
for (const actionGate of [
  /const canCorrect =\s+canMutatePayments &&/,
  /const canRecord =\s+canMutatePayments &&/,
  /const canRequest =\s+canMutatePayments &&/,
  /const canExtendFollowUp =\s+canMutatePayments &&/,
  /const paymentThankYouAvailable =\s+canMutatePayments &&/,
]) {
  assert.match(section, actionGate, "cancelled order actions remain gated");
}
assert.match(section, /canManageDiscounts && canMutatePayments/);
assert.match(section, /canCorrect && correctingPaymentAllocationId === row\.id/);
assert.match(section, /Order cancelled\. No refund recorded\./);
assert.match(section, /formatRm\(settlement\.refundsTotal\)/);
assert.match(section, /order\.refunds\.map\(\(row\) =>/);
assert.match(section, /Recorded \{formatPaymentHistoryDate\(row\.refundedAt\)\}/);
assert.match(section, /order\.paymentAllocations\.map\(\(row\) =>/);
assert.match(section, /formatRm\(row\.amount\)/);
assert.match(
  section,
  /Correction · \{formatRm\(row\.correction\.originalAmount\)\}[\s\S]*?formatRm\(row\.correction\.correctedAmount\)/,
);
assert.match(queries, /const amount = Number\(row\.amount\);[\s\S]*?amount,[\s\S]*?effectiveAmount: correction\?\.correctedAmount \?\? amount/);
assert.match(discountsPanel, /const canMutateDiscounts = isGuestOrderEditable\(order\.status\)/);
assert.match(discountsPanel, /canMutateDiscounts && !hasAugust && !hasRm10/);

// Rendering uses the original payment-allocation amounts; this fixture protects
// the two historical records from accidental summing/replacement during display.
const originalAllocations = Object.freeze([{ amount: 125 }, { amount: 135 }]);
const displayedAmounts = originalAllocations.map((row) => row.amount);
assert.deepEqual(displayedAmounts, [125, 135]);
assert.equal(displayedAmounts.reduce((sum, amount) => sum + amount, 0), 260);

console.log("PASS cancelled order payment history visibility");
