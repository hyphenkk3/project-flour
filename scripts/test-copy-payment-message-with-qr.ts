/**
 * Copy wholecake payment message + QR clipboard helper.
 * Run: npx tsx scripts/test-copy-payment-message-with-qr.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WHOLECAKE_PREORDER_PAYMENT_QR_SRC } from "@/engines/orders/payment-details";
import { generatePaymentRequestMessage } from "@/engines/orders/payment-message";
import {
  COPY_MESSAGE_AND_QR_FAILED,
  COPY_MESSAGE_AND_QR_UNSUPPORTED,
  copyPaymentMessageWithQr,
  copyPaymentMessageWithQrError,
  supportsPaymentMessageQrClipboard,
} from "@/workspaces/owner/orders/copy-payment-message-with-qr";

const root = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

assert.equal(
  WHOLECAKE_PREORDER_PAYMENT_QR_SRC,
  "/payment/whitebird_wholecake_payment_qr.png",
);
assert.equal(
  COPY_MESSAGE_AND_QR_UNSUPPORTED,
  "Your browser does not support copying the message and QR together. Please copy the message and QR separately.",
);
assert.equal(
  copyPaymentMessageWithQrError("unsupported"),
  COPY_MESSAGE_AND_QR_UNSUPPORTED,
);
assert.equal(
  copyPaymentMessageWithQrError("failed"),
  COPY_MESSAGE_AND_QR_FAILED,
);

assert.equal(supportsPaymentMessageQrClipboard(null, undefined), false);
assert.equal(
  supportsPaymentMessageQrClipboard(
    { write: async () => undefined },
    undefined,
  ),
  false,
);

const message = generatePaymentRequestMessage({
  commercialSubtotal: 135,
  amountDue: 135,
  netReceived: 0,
  remainingBalance: 135,
  adjustments: [],
  method: "wb_qr",
  wholecakePreorderQr: true,
});

const pngBytes = new Uint8Array([137, 80, 78, 71]);
let fetchedUrl = "";
const fetchImpl: typeof fetch = async (input) => {
  fetchedUrl = String(input);
  return {
    ok: true,
    blob: async () => new Blob([pngBytes], { type: "image/png" }),
  } as Response;
};

let written: ClipboardItem[] | null = null;
const clipboard = {
  write: async (items: ClipboardItem[]) => {
    written = items;
  },
};

class FakeClipboardItem {
  readonly types: string[];
  private readonly items: Record<string, Blob | Promise<Blob>>;
  constructor(items: Record<string, Blob | Promise<Blob>>) {
    this.items = items;
    this.types = Object.keys(items);
  }
  async getType(type: string): Promise<Blob> {
    const value = this.items[type];
    return await value;
  }
}

void (async () => {
  const supported = await copyPaymentMessageWithQr({
    message,
    qrSrc: WHOLECAKE_PREORDER_PAYMENT_QR_SRC,
    fetchImpl,
    clipboard,
    clipboardItemCtor: FakeClipboardItem as unknown as typeof ClipboardItem,
  });
  assert.deepEqual(supported, { ok: true });
  assert.equal(fetchedUrl, "/payment/whitebird_wholecake_payment_qr.png");
  assert.ok(written);
  assert.equal(written.length, 1);
  assert.ok(written[0].types.includes("text/plain"));
  assert.ok(written[0].types.includes("image/png"));
  const text = await written[0].getType("text/plain");
  assert.equal(await text.text(), message);
  const image = await written[0].getType("image/png");
  assert.equal(image.type, "image/png");
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), pngBytes);

  const unsupported = await copyPaymentMessageWithQr({
    message,
    qrSrc: WHOLECAKE_PREORDER_PAYMENT_QR_SRC,
    fetchImpl,
    clipboard: null,
  });
  assert.deepEqual(unsupported, { ok: false, reason: "unsupported" });

  const failedFetch = await copyPaymentMessageWithQr({
    message,
    qrSrc: WHOLECAKE_PREORDER_PAYMENT_QR_SRC,
    fetchImpl: async () => ({ ok: false }) as Response,
    clipboard,
    clipboardItemCtor: FakeClipboardItem as unknown as typeof ClipboardItem,
  });
  assert.deepEqual(failedFetch, { ok: false, reason: "failed" });

  const failedWrite = await copyPaymentMessageWithQr({
    message,
    qrSrc: WHOLECAKE_PREORDER_PAYMENT_QR_SRC,
    fetchImpl,
    clipboard: {
      write: async () => {
        throw new Error("denied");
      },
    },
    clipboardItemCtor: FakeClipboardItem as unknown as typeof ClipboardItem,
  });
  assert.deepEqual(failedWrite, { ok: false, reason: "failed" });

  const previewSrc = readSrc(
    "src/workspaces/owner/orders/PaymentRequestPreview.tsx",
  );
  assert.match(previewSrc, /Copy Message \+ QR/);
  assert.match(previewSrc, /Message \+ QR copied/);
  assert.match(
    previewSrc,
    /canCopyMessageAndQr = method === "wb_qr" && wholecakePreorderQr/,
  );
  assert.match(previewSrc, /copyPaymentMessageWithQr/);
  assert.match(previewSrc, /qrSrc: WHOLECAKE_PREORDER_PAYMENT_QR_SRC/);
  assert.match(previewSrc, /handleOpenWhatsApp/);
  assert.match(previewSrc, /Open WhatsApp/);
  assert.match(previewSrc, /Copy Message/);
  assert.match(
    previewSrc,
    /window\.open\(whatsappUrl, "_blank", "noopener,noreferrer"\)/,
  );
  assert.match(previewSrc, /\{canCopyMessageAndQr \? \(/);
  assert.doesNotMatch(previewSrc, /canvas/i);

  const helperSrc = readSrc(
    "src/workspaces/owner/orders/copy-payment-message-with-qr.ts",
  );
  assert.match(helperSrc, /"text\/plain"/);
  assert.match(helperSrc, /"image\/png"/);
  assert.match(helperSrc, /ClipboardItem/);
  assert.match(helperSrc, /clipboard\.write/);
  assert.doesNotMatch(helperSrc, /canvas/i);
  assert.doesNotMatch(helperSrc, /contrast/);
  assert.doesNotMatch(helperSrc, /filter/);

  console.log("PASS copy payment message with QR");
})().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
