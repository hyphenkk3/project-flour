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

const wholecakeQr = generatePaymentRequestMessage(
  payload({ wholecakePreorderQr: true }),
);
assert.match(wholecakeQr, /Whitebird Wholecake Preorder Payment QR/);
assert.match(wholecakeQr, /wholecake preorder payments only/);
assert.match(wholecakeQr, /not for dine-in, beverages, or other items/i);
assert.match(wholecakeQr, /payment slip WITH Status/);
assert.doesNotMatch(wholecakeQr, /automatically verified/);
assert.doesNotMatch(wholecakeQr, /CIMB Bank Berhad/);

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
assert.match(previewSrc, /contrast-\[1000%\]/);

const detailsSrc = readSrc("src/engines/orders/payment-details.ts");
assert.doesNotMatch(detailsSrc, /Maybank/);
assert.doesNotMatch(detailsSrc, /123456789012/);
assert.doesNotMatch(
  detailsSrc,
  /Placeholder operational details for Preview 1/,
);

console.log("PASS payment details (wholecake preorder instructions)");
