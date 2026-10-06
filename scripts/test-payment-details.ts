/**
 * Wholecake preorder payment instruction details.
 * Run: npx tsx scripts/test-payment-details.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getPaymentRequestDetails,
  isWholecakePreorderPaymentContext,
  PAYMENT_DETAILS,
  WHOLECAKE_PREORDER_PAYMENT_QR_LABEL,
  WHOLECAKE_PREORDER_PAYMENT_QR_SCOPE,
  WHOLECAKE_PREORDER_PAYMENT_QR_SRC,
} from "@/engines/orders/payment-details";
import {
  generatePaymentRequestMessage,
  type PaymentRequestPayload,
} from "@/engines/orders/payment-message";
import type { OrderSource } from "@/types/storefront";

const root = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

const transfer = getPaymentRequestDetails("online_transfer");
assert.equal(transfer.method, "online_transfer");
assert.equal(transfer.label, "Online Transfer");
if (transfer.method !== "online_transfer") throw new Error("unreachable");
assert.equal(transfer.bankName, "CIMB Bank Berhad");
assert.equal(transfer.accountName, "THE HYPHEN SDN BHD");
assert.equal(transfer.accountNumber, "8604100053");
assert.equal(PAYMENT_DETAILS.online_transfer.bankName, "CIMB Bank Berhad");
assert.doesNotMatch(JSON.stringify(PAYMENT_DETAILS), /Maybank/);
assert.doesNotMatch(JSON.stringify(PAYMENT_DETAILS), /123456789012/);
assert.doesNotMatch(JSON.stringify(PAYMENT_DETAILS), /Whitebird Cake House/);

assert.equal(
  WHOLECAKE_PREORDER_PAYMENT_QR_SRC,
  "/payment/whitebird_wholecake_payment_qr.png",
);
assert.equal(
  WHOLECAKE_PREORDER_PAYMENT_QR_LABEL,
  "Whitebird Wholecake Preorder Payment QR",
);
assert.match(
  WHOLECAKE_PREORDER_PAYMENT_QR_SCOPE,
  /wholecake preorder payments only/i,
);
assert.match(WHOLECAKE_PREORDER_PAYMENT_QR_SCOPE, /Not for dine-in/i);

const qrFile = resolve(
  root,
  "public/payment/whitebird_wholecake_payment_qr.png",
);
assert.equal(existsSync(qrFile), true, "wholecake preorder payment QR asset");

assert.equal(
  isWholecakePreorderPaymentContext({ fulfilmentMethod: "pickup" }),
  true,
);
assert.equal(
  isWholecakePreorderPaymentContext({ fulfilmentMethod: "delivery" }),
  true,
);
assert.equal(
  isWholecakePreorderPaymentContext({ fulfilmentMethod: "dine_in" }),
  false,
);
assert.equal(
  isWholecakePreorderPaymentContext({
    extraStockId: "extra-1",
    fulfilmentMethod: "pickup",
  }),
  false,
);
for (const fulfilmentMethod of ["pickup", "delivery", "dine_in"]) {
  assert.equal(
    isWholecakePreorderPaymentContext({
      extraStockId: "fresh-pick-1",
      fulfilmentMethod,
      orderSource: "customer_website",
    }),
    true,
    `customer Fresh Pick ${fulfilmentMethod} uses preorder QR context`,
  );
}
assert.equal(
  isWholecakePreorderPaymentContext({
    extraStockId: "other-extra-1",
    fulfilmentMethod: "pickup",
    orderSource: "walk_in",
  }),
  false,
);

function payload(
  overrides: Partial<PaymentRequestPayload> = {},
): PaymentRequestPayload {
  return {
    commercialSubtotal: 135,
    amountDue: 135,
    netReceived: 0,
    remainingBalance: 135,
    adjustments: [],
    method: "wb_qr",
    ...overrides,
  };
}

function canSharePaymentForOrder(input: {
  status: string;
  remainingBalance: number;
  method: string;
  extraStockId?: string | null;
  fulfilmentMethod?: string | null;
  orderSource?: OrderSource | null;
}): boolean {
  return (
    input.status === "awaiting_payment" &&
    input.remainingBalance > 0 &&
    input.method === "wb_qr" &&
    isWholecakePreorderPaymentContext(input)
  );
}

for (const fulfilmentMethod of ["pickup", "delivery", "dine_in"]) {
  assert.equal(
    canSharePaymentForOrder({
      status: "awaiting_payment",
      remainingBalance: 85,
      method: "wb_qr",
      extraStockId: "fresh-pick-1",
      fulfilmentMethod,
      orderSource: "customer_website",
    }),
    true,
    `Fresh Pick ${fulfilmentMethod} with balance can share payment`,
  );
}
assert.equal(
  canSharePaymentForOrder({
    status: "paid",
    remainingBalance: 0,
    method: "wb_qr",
    extraStockId: "fresh-pick-1",
    fulfilmentMethod: "pickup",
    orderSource: "customer_website",
  }),
  false,
  "paid Fresh Pick with zero balance cannot share payment",
);
assert.equal(
  canSharePaymentForOrder({
    status: "awaiting_payment",
    remainingBalance: 85,
    method: "wb_qr",
    extraStockId: "other-extra-1",
    fulfilmentMethod: "pickup",
    orderSource: "walk_in",
  }),
  false,
  "non-Fresh-Pick EXTRA remains ineligible",
);
assert.equal(
  canSharePaymentForOrder({
    status: "awaiting_payment",
    remainingBalance: 85,
    method: "wb_qr",
    fulfilmentMethod: "pickup",
    orderSource: "customer_website",
  }),
  true,
  "whole-cake preorder remains eligible",
);

const wholecakeQr = generatePaymentRequestMessage(
  payload({ wholecakePreorderQr: true }),
);
assert.match(wholecakeQr, /Thank you for confirming\. ;\)/);
assert.match(wholecakeQr, /Here are the payment details:/);
assert.match(wholecakeQr, /Amount: RM135/);
assert.match(
  wholecakeQr,
  /Please make payment using the attached Whitebird Wholecake Preorder Payment QR\./,
);
assert.match(
  wholecakeQr,
  /Just a note — this QR is for wholecake preorder payments only\. It is not for dine-in, beverages, or other items\./,
);
assert.match(
  wholecakeQr,
  /Once payment is completed, please send us the payment slip within 24 hours, with the payment status clearly shown \(e\.g\. “Successful”\) ya\. 😊/,
);
assert.doesNotMatch(wholecakeQr, /payment slip WITH Status/);
assert.doesNotMatch(wholecakeQr, /using the .* below/);
assert.doesNotMatch(wholecakeQr, /automatically verified/);
assert.doesNotMatch(wholecakeQr, /CIMB Bank Berhad/);

const wholecakePartial = generatePaymentRequestMessage(
  payload({
    wholecakePreorderQr: true,
    netReceived: 50,
    remainingBalance: 85,
  }),
);
assert.match(wholecakePartial, /Balance to Pay: RM85/);
assert.match(
  wholecakePartial,
  /Please make payment using the attached Whitebird Wholecake Preorder Payment QR\./,
);

for (const fulfilmentMethod of ["pickup", "delivery", "dine_in"]) {
  const freshPickContext = isWholecakePreorderPaymentContext({
    extraStockId: "fresh-pick-1",
    fulfilmentMethod,
    orderSource: "customer_website",
  });
  assert.equal(freshPickContext, true);
  const freshPickPaymentRequest = generatePaymentRequestMessage(
    payload({
      wholecakePreorderQr: freshPickContext,
      netReceived: 50,
      remainingBalance: 85,
    }),
  );
  assert.equal(freshPickPaymentRequest, wholecakePartial);
  assert.match(freshPickPaymentRequest, /Balance to Pay: RM85/);
  assert.match(
    freshPickPaymentRequest,
    /Whitebird Wholecake Preorder Payment QR/,
  );
}

const extraQr = generatePaymentRequestMessage(
  payload({ wholecakePreorderQr: false }),
);
assert.match(extraQr, /Whitebird QR code below/);
assert.doesNotMatch(extraQr, /Wholecake Preorder Payment QR/);
assert.doesNotMatch(extraQr, /wholecake preorder payments only/);

const transferMsg = generatePaymentRequestMessage(
  payload({ method: "online_transfer" }),
);
assert.match(transferMsg, /Bank: CIMB Bank Berhad/);
assert.match(transferMsg, /Account Name: THE HYPHEN SDN BHD/);
assert.match(transferMsg, /Account No\.: 8604100053/);
assert.doesNotMatch(transferMsg, /Maybank/);
assert.doesNotMatch(transferMsg, /123456789012/);
assert.doesNotMatch(transferMsg, /Wholecake Preorder Payment QR/);
assert.match(transferMsg, /payment slip WITH Status/);

const previewSrc = readSrc(
  "src/workspaces/owner/orders/PaymentRequestPreview.tsx",
);
assert.match(previewSrc, /WHOLECAKE_PREORDER_PAYMENT_QR_SRC/);
assert.match(previewSrc, /isWholecakePreorderPaymentContext/);
assert.match(previewSrc, /wholecakePreorderQr/);
assert.match(previewSrc, /orderSource: order\.orderSource/);
assert.match(previewSrc, /canSharePayment = canCopyMessageAndQr/);
assert.match(previewSrc, /qrSrc: WHOLECAKE_PREORDER_PAYMENT_QR_SRC/);
assert.match(previewSrc, /contrast-\[1000%\]/);

const paymentSectionSrc = readSrc(
  "src/workspaces/owner/orders/PaymentSection.tsx",
);
assert.match(paymentSectionSrc, /settlement\.remainingBalance > 0/);
assert.match(paymentSectionSrc, /order\.status === "awaiting_payment"/);
assert.match(previewSrc, /method === "wb_qr" && wholecakePreorderQr/);

const paymentRouteSrc = readSrc(
  "src/app/(app)/owner/orders/[id]/payment/page.tsx",
);
assert.match(paymentRouteSrc, /order\.settlement\.remainingBalance <= 0/);

const detailsSrc = readSrc("src/engines/orders/payment-details.ts");
assert.doesNotMatch(detailsSrc, /Maybank/);
assert.doesNotMatch(detailsSrc, /123456789012/);
assert.doesNotMatch(
  detailsSrc,
  /Placeholder operational details for Preview 1/,
);

console.log("PASS payment details (wholecake preorder instructions)");
