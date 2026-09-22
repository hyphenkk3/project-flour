export const COPY_MESSAGE_AND_QR_UNSUPPORTED =
  "Your browser does not support copying the message and QR together. Please copy the message and QR separately.";

export const COPY_MESSAGE_AND_QR_FAILED =
  "Could not copy the message and QR. Please copy the message and QR separately.";

export type CopyPaymentMessageWithQrResult =
  { ok: true } | { ok: false; reason: "unsupported" | "failed" };

export function supportsPaymentMessageQrClipboard(
  clipboard: Pick<Clipboard, "write"> | null | undefined = globalThis.navigator
    ?.clipboard,
  clipboardItemCtor:
    typeof ClipboardItem | undefined = globalThis.ClipboardItem,
): boolean {
  return (
    typeof clipboardItemCtor === "function" &&
    !!clipboard &&
    typeof clipboard.write === "function"
  );
}

function pngBlob(bytes: Blob): Blob {
  if (bytes.type === "image/png") return bytes;
  return new Blob([bytes], { type: "image/png" });
}

async function writeClipboardItem(
  clipboard: Pick<Clipboard, "write">,
  ClipboardItemCtor: typeof ClipboardItem,
  textBlob: Blob,
  imageBlob: Blob,
): Promise<void> {
  try {
    await clipboard.write([
      new ClipboardItemCtor({
        "text/plain": textBlob,
        "image/png": imageBlob,
      }),
    ]);
  } catch {
    await clipboard.write([
      new ClipboardItemCtor({
        "text/plain": Promise.resolve(textBlob),
        "image/png": Promise.resolve(imageBlob),
      }),
    ]);
  }
}

/**
 * Copies the existing payment message plus the original wholecake QR PNG.
 * Does not recolor, redraw, or re-encode the QR pixels.
 */
export async function copyPaymentMessageWithQr(input: {
  message: string;
  qrSrc: string;
  fetchImpl?: typeof fetch;
  clipboard?: Pick<Clipboard, "write"> | null;
  clipboardItemCtor?: typeof ClipboardItem;
}): Promise<CopyPaymentMessageWithQrResult> {
  const clipboard = input.clipboard ?? globalThis.navigator?.clipboard;
  const ClipboardItemCtor = input.clipboardItemCtor ?? globalThis.ClipboardItem;
  if (!supportsPaymentMessageQrClipboard(clipboard, ClipboardItemCtor)) {
    return { ok: false, reason: "unsupported" };
  }

  try {
    const fetchImpl = input.fetchImpl ?? fetch;
    const response = await fetchImpl(input.qrSrc);
    if (!response.ok) return { ok: false, reason: "failed" };
    const imageBlob = pngBlob(await response.blob());
    const textBlob = new Blob([input.message], { type: "text/plain" });
    await writeClipboardItem(clipboard, ClipboardItemCtor, textBlob, imageBlob);
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export function copyPaymentMessageWithQrError(
  reason: "unsupported" | "failed",
): string {
  return reason === "unsupported"
    ? COPY_MESSAGE_AND_QR_UNSUPPORTED
    : COPY_MESSAGE_AND_QR_FAILED;
}
