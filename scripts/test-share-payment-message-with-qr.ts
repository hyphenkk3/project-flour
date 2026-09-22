/**
 * Share wholecake payment message + QR via Web Share.
 * Run: npx tsx scripts/test-share-payment-message-with-qr.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WHOLECAKE_PREORDER_PAYMENT_QR_SRC } from "@/engines/orders/payment-details";
import { generatePaymentRequestMessage } from "@/engines/orders/payment-message";
import {
  fetchPaymentQrFile,
  isShareCancellation,
  paymentQrFileFromBlob,
  SHARE_PAYMENT_UNSUPPORTED,
  sharePaymentMessageWithQr,
  sharePaymentMessageWithQrError,
  sharePaymentPayload,
  supportsPaymentMessageQrShare,
  WHOLECAKE_PREORDER_PAYMENT_QR_FILENAME,
} from "@/workspaces/owner/orders/share-payment-message-with-qr";

const root = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

assert.equal(
  WHOLECAKE_PREORDER_PAYMENT_QR_SRC,
  "/payment/whitebird_wholecake_payment_qr.png",
);
assert.equal(
  WHOLECAKE_PREORDER_PAYMENT_QR_FILENAME,
  "whitebird_wholecake_payment_qr.png",
);
assert.equal(
  SHARE_PAYMENT_UNSUPPORTED,
  "Your browser does not support sharing the payment message and QR together. Please use Open WhatsApp and send the QR separately.",
);
assert.equal(
  sharePaymentMessageWithQrError("unsupported"),
  SHARE_PAYMENT_UNSUPPORTED,
);

assert.equal(supportsPaymentMessageQrShare(null), false);
assert.equal(
  supportsPaymentMessageQrShare({ share: async () => undefined }),
  true,
);

const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10]);
const qrFile = paymentQrFileFromBlob(
  new Blob([pngBytes], { type: "image/png" }),
);
assert.equal(qrFile.name, WHOLECAKE_PREORDER_PAYMENT_QR_FILENAME);
assert.equal(qrFile.type, "image/png");

const message = generatePaymentRequestMessage({
  commercialSubtotal: 135,
  amountDue: 135,
  netReceived: 0,
  remainingBalance: 135,
  adjustments: [],
  method: "wb_qr",
  wholecakePreorderQr: true,
});

const payload = sharePaymentPayload({ message, qrFile });
assert.equal(payload.text, message);
assert.equal(payload.files?.length, 1);
assert.equal(payload.files?.[0], qrFile);

assert.equal(isShareCancellation({ name: "AbortError" }), true);
assert.equal(isShareCancellation({ name: "NotAllowedError" }), false);
assert.equal(isShareCancellation(null), false);

void (async () => {
  const fromBlob = new Uint8Array(await qrFile.arrayBuffer());
  assert.deepEqual(fromBlob, pngBytes);

  let fetchedUrl = "";
  const file = await fetchPaymentQrFile({
    qrSrc: WHOLECAKE_PREORDER_PAYMENT_QR_SRC,
    fetchImpl: async (input) => {
      fetchedUrl = String(input);
      return {
        ok: true,
        blob: async () => new Blob([pngBytes], { type: "image/png" }),
      } as Response;
    },
  });
  assert.equal(fetchedUrl, "/payment/whitebird_wholecake_payment_qr.png");
  assert.ok(file);
  assert.equal(file.type, "image/png");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), pngBytes);

  let shared: ShareData | null = null;
  const ok = await sharePaymentMessageWithQr({
    message,
    qrFile,
    shareApi: {
      share: async (data) => {
        shared = data;
      },
      canShare: () => true,
    },
  });
  assert.deepEqual(ok, { ok: true });
  assert.equal(shared?.text, message);
  assert.equal(shared?.files?.[0], qrFile);

  const unsupportedShare = await sharePaymentMessageWithQr({
    message,
    qrFile,
    shareApi: null,
  });
  assert.deepEqual(unsupportedShare, { ok: false, reason: "unsupported" });

  const unsupportedFiles = await sharePaymentMessageWithQr({
    message,
    qrFile,
    shareApi: {
      share: async () => undefined,
      canShare: () => false,
    },
  });
  assert.deepEqual(unsupportedFiles, { ok: false, reason: "unsupported" });

  const cancelled = await sharePaymentMessageWithQr({
    message,
    qrFile,
    shareApi: {
      share: async () => {
        const error = new Error("Share canceled");
        error.name = "AbortError";
        throw error;
      },
      canShare: () => true,
    },
  });
  assert.deepEqual(cancelled, { ok: false, reason: "cancelled" });

  const failed = await sharePaymentMessageWithQr({
    message,
    qrFile,
    shareApi: {
      share: async () => {
        throw new Error("denied");
      },
      canShare: () => true,
    },
  });
  assert.deepEqual(failed, { ok: false, reason: "failed" });

  const previewSrc = readSrc(
    "src/workspaces/owner/orders/PaymentRequestPreview.tsx",
  );
  assert.match(previewSrc, /Share Payment/);
  assert.match(previewSrc, /Payment shared/);
  assert.match(previewSrc, /canSharePayment = canCopyMessageAndQr/);
  assert.match(previewSrc, /sharePaymentMessageWithQr/);
  assert.match(previewSrc, /fetchPaymentQrFile/);
  assert.match(previewSrc, /qrSrc: WHOLECAKE_PREORDER_PAYMENT_QR_SRC/);
  assert.match(previewSrc, /Copy Message \+ QR/);
  assert.match(previewSrc, /Open WhatsApp/);
  assert.match(previewSrc, /Copy Message/);
  assert.match(
    previewSrc,
    /window\.open\(whatsappUrl, "_blank", "noopener,noreferrer"\)/,
  );
  assert.doesNotMatch(previewSrc, /canvas/i);

  const helperSrc = readSrc(
    "src/workspaces/owner/orders/share-payment-message-with-qr.ts",
  );
  assert.match(helperSrc, /navigator\.share/);
  assert.match(helperSrc, /canShare/);
  assert.match(helperSrc, /files: \[input\.qrFile\]/);
  assert.match(helperSrc, /AbortError/);
  assert.doesNotMatch(helperSrc, /canvas/i);
  assert.doesNotMatch(helperSrc, /wa\.me/);
  assert.doesNotMatch(helperSrc, /data:image/);
  assert.doesNotMatch(previewSrc, /data:image/);
  assert.match(helperSrc, /user gesture/);

  console.log("PASS share payment message with QR");
})().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
