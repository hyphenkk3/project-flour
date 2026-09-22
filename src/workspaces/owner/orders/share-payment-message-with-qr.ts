/**
 * Share the existing wholecake payment message plus the original QR PNG
 * via Web Share (`navigator.share`). The PNG bytes are wrapped as a File
 * without recolor, regeneration, or data URLs.
 *
 * Safari user-gesture limitation: `navigator.share` must run in the same
 * turn as a trusted click. Prefetch the QR File before the click. If the
 * click handler still has to `await fetch()` first, Safari may reject the
 * subsequent `share()` because the user gesture has been lost. There is no
 * reliable workaround for that case; keep prefetch and fail gracefully.
 */
export const SHARE_PAYMENT_UNSUPPORTED =
  "Your browser does not support sharing the payment message and QR together. Please use Open WhatsApp and send the QR separately.";

export const SHARE_PAYMENT_FAILED =
  "Could not share the payment message and QR. Please use Open WhatsApp and send the QR separately.";

export const WHOLECAKE_PREORDER_PAYMENT_QR_FILENAME =
  "whitebird_wholecake_payment_qr.png";

export type SharePaymentMessageWithQrResult =
  { ok: true } | { ok: false; reason: "unsupported" | "failed" | "cancelled" };

export type PaymentShareApi = {
  share: (data: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
};

export function isShareCancellation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return "name" in error && error.name === "AbortError";
}

export function supportsPaymentMessageQrShare(
  api: PaymentShareApi | null | undefined,
  qrFile?: File,
): boolean {
  if (!api || typeof api.share !== "function") return false;
  if (typeof api.canShare !== "function") return true;
  if (!qrFile) return true;
  return api.canShare({ files: [qrFile] });
}

export function paymentQrFileFromBlob(
  bytes: Blob,
  filename = WHOLECAKE_PREORDER_PAYMENT_QR_FILENAME,
): File {
  const png =
    bytes.type === "image/png"
      ? bytes
      : new Blob([bytes], { type: "image/png" });
  return new File([png], filename, { type: "image/png" });
}

export async function fetchPaymentQrFile(input: {
  qrSrc: string;
  fetchImpl?: typeof fetch;
}): Promise<File | null> {
  try {
    const fetchImpl = input.fetchImpl ?? fetch;
    const response = await fetchImpl(input.qrSrc);
    if (!response.ok) return null;
    return paymentQrFileFromBlob(await response.blob());
  } catch {
    return null;
  }
}

export function sharePaymentPayload(input: {
  message: string;
  qrFile: File;
}): ShareData {
  return {
    text: input.message,
    files: [input.qrFile],
  };
}

export async function sharePaymentMessageWithQr(input: {
  message: string;
  qrFile: File;
  shareApi?: PaymentShareApi | null;
}): Promise<SharePaymentMessageWithQrResult> {
  const shareApi =
    input.shareApi ??
    (typeof navigator === "undefined"
      ? null
      : {
          share: navigator.share?.bind(navigator),
          canShare: navigator.canShare?.bind(navigator),
        });
  if (
    !shareApi?.share ||
    !supportsPaymentMessageQrShare(shareApi, input.qrFile)
  ) {
    return { ok: false, reason: "unsupported" };
  }

  const data = sharePaymentPayload({
    message: input.message,
    qrFile: input.qrFile,
  });

  try {
    await shareApi.share(data);
    return { ok: true };
  } catch (error) {
    if (isShareCancellation(error)) return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "failed" };
  }
}

export function sharePaymentMessageWithQrError(
  reason: "unsupported" | "failed",
): string {
  return reason === "unsupported"
    ? SHARE_PAYMENT_UNSUPPORTED
    : SHARE_PAYMENT_FAILED;
}
