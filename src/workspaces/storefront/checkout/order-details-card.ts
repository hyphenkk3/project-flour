import { dineInVenueLabel } from "@/engines/business-calendar/dine-in-hours";
import { workspaceFulfilmentSectionTitle } from "@/engines/orders/fulfilment";
import {
  formatCustomerOrderPlacedAt,
  formatLongBusinessDayMonthYear,
} from "@/lib/dates";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { GuestPreorderReceipt } from "@/workspaces/storefront/checkout/receipt";

export const ORDER_DETAILS_CARD_FOOTER = "Please keep this for your reference.";
export const ORDER_DETAILS_PNG_WIDTH = 1080;
export const ORDER_DETAILS_PNG_HEIGHT = 1800;
export const ORDER_DETAILS_CARD_PAYMENT = "Payment Pending";
export const ORDER_DETAILS_CARD_CONTACT =
  "Whitebird will contact you via WhatsApp to proceed with payment and confirm your order.";
export const ORDER_DETAILS_NOTICE_TITLE = "IMPORTANT — PLEASE TAKE NOTE";
export const ORDER_DETAILS_NOTICE_BODY =
  "If you do not receive a confirmation from us within 24 hours, please contact us via WhatsApp.";
export const ORDER_DETAILS_CAKE_PHOTO_SIZE = 112;

const PAPER = "#f5f0e9";
const INK = "#1c1916";
const SKYLINE = "#5a534c";
const FOG = "#ddd4c8";
const SIGNAL = "#2f6f6a";

const PAD_X = 92;
const CONTENT_WIDTH = ORDER_DETAILS_PNG_WIDTH - PAD_X * 2;

/** Same families as `src/app/layout.tsx` (Newsreader display, Outfit sans). */
const DISPLAY_FONT_FALLBACK = "Newsreader, serif";
const SANS_FONT_FALLBACK = "Outfit, system-ui, sans-serif";

export function storefrontCanvasFontFamily(
  kind: "display" | "sans",
): string {
  const fallback =
    kind === "display" ? DISPLAY_FONT_FALLBACK : SANS_FONT_FALLBACK;
  if (typeof document === "undefined") return fallback;
  const source = document.body ?? document.documentElement;
  const value = getComputedStyle(source)
    .getPropertyValue(kind === "display" ? "--font-display" : "--font-sans")
    .trim();
  return value || fallback;
}

const CANVAS_FONT_WAIT_MS = 2000;

export async function ensureStorefrontCanvasFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  if (document.fonts.status === "loaded") return;
  const load = async () => {
    await document.fonts.ready;
    const display = storefrontCanvasFontFamily("display");
    const sans = storefrontCanvasFontFamily("sans");
    await Promise.all([
      document.fonts.load(`400 48px ${display}`),
      document.fonts.load(`400 28px ${display}`),
      document.fonts.load(`400 34px ${display}`),
      document.fonts.load(`400 18px ${sans}`),
      document.fonts.load(`500 15px ${sans}`),
    ]).catch(() => undefined);
  };
  await Promise.race([
    load(),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, CANVAS_FONT_WAIT_MS);
    }),
  ]);
}

export type OrderDetailsCardLine = {
  name: string;
  meta: string;
  price: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
};

export type OrderDetailsCardRow = {
  label: string;
  value: string;
};

export type OrderDetailsCardModel = {
  brand: string;
  title: string;
  paymentStatus: string;
  contactLine: string;
  noticeTitle: string;
  noticeBody: string;
  orderNumber: string;
  placedAt: string;
  customer: string;
  whatsapp: string;
  collectionWhen: string;
  fulfilment: string;
  collectionExtras: OrderDetailsCardRow[];
  cakes: OrderDetailsCardLine[];
  addons: OrderDetailsCardLine[];
  complimentary: OrderDetailsCardLine[];
  total: string;
  notes: string | null;
  footer: string;
};

export function buildOrderDetailsCardModel(
  receipt: GuestPreorderReceipt,
): OrderDetailsCardModel {
  const collectionTime =
    receipt.fulfilmentMethod === "dine_in" && receipt.reservationTime
      ? formatPickupTime(receipt.reservationTime)
      : formatPickupTime(receipt.pickupTime);
  const collectionExtras: OrderDetailsCardRow[] = [];
  if (receipt.fulfilmentMethod === "dine_in" && receipt.dineInVenue) {
    collectionExtras.push({
      label: "Venue",
      value: dineInVenueLabel(receipt.dineInVenue),
    });
  }
  if (receipt.fulfilmentMethod === "dine_in" && receipt.guestCount != null) {
    collectionExtras.push({
      label: "Guests",
      value: `${receipt.guestCount} ${
        receipt.guestCount === 1 ? "guest" : "guests"
      }`,
    });
  }

  return {
    brand: "WHITEBIRD",
    title: "ORDER RECEIVED",
    paymentStatus: ORDER_DETAILS_CARD_PAYMENT,
    contactLine: ORDER_DETAILS_CARD_CONTACT,
    noticeTitle: ORDER_DETAILS_NOTICE_TITLE,
    noticeBody: ORDER_DETAILS_NOTICE_BODY,
    orderNumber: receipt.orderNumber?.trim() || "—",
    placedAt: receipt.placedAt
      ? formatCustomerOrderPlacedAt(receipt.placedAt)
      : "—",
    customer: receipt.guestName.trim() || "—",
    whatsapp: receipt.guestPhone.trim() || "—",
    collectionWhen: `${formatLongBusinessDayMonthYear(receipt.pickupDate)} · ${collectionTime}`,
    fulfilment: workspaceFulfilmentSectionTitle(receipt.fulfilmentMethod),
    collectionExtras,
    cakes: receipt.items.map((item) => ({
      name: item.cakeName,
      meta: `${item.sizeLabel} × ${item.quantity}`,
      price:
        item.unitPrice != null
          ? formatRm(item.unitPrice * item.quantity)
          : null,
      imageUrl: item.imageUrl,
      imageAlt: item.imageAlt,
    })),
    addons: receipt.paidAddons.map((addon) => ({
      name: addon.name,
      meta: `× ${addon.quantity}`,
      price: formatRm(addon.unitPrice * addon.quantity),
    })),
    complimentary: receipt.complimentaryItems.map((item) => ({
      name: item.name,
      meta: `× ${item.quantity} · Complimentary`,
      price: null,
    })),
    total: formatRm(receipt.total),
    notes: receipt.notes,
    footer: ORDER_DETAILS_CARD_FOOTER,
  };
}

export function orderDetailsFileName(orderNumber: string | null): string {
  const slug = (orderNumber ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `whitebird-order-${slug}.png` : "whitebird-order-details.png";
}

export function wrapCanvasText(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  const input = text.trim();
  if (!input) return [];
  const lines: string[] = [];
  for (const paragraph of input.split(/\n/)) {
    const words = paragraph.trim() ? paragraph.trim().split(/\s+/) : [""];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (measure(next) <= maxWidth || !current) {
        current = next;
        continue;
      }
      lines.push(current);
      current = word;
    }
    if (current || paragraph === "") lines.push(current);
  }
  return lines;
}

type ShareNavigator = {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
};

export type OrderDetailsFileShareCapability = boolean | "unknown";
export type OrderDetailsSavePath = "share" | "download" | "preview";
export type OrderDetailsSaveAction = "shared" | "downloaded" | "preview";
export type OrderDetailsSaveResult = {
  action: OrderDetailsSaveAction;
  objectUrl?: string;
};

export function canShareOrderDetailsFile(
  file: File,
  nav: ShareNavigator | undefined = globalThis.navigator,
): boolean {
  if (!nav?.share) return false;
  if (typeof nav.canShare !== "function") return true;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function orderDetailsFileShareCapability(
  file: File,
  nav: ShareNavigator | undefined = globalThis.navigator,
): OrderDetailsFileShareCapability {
  if (!nav?.share) return false;
  if (typeof nav.canShare !== "function") return "unknown";
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Photo 2 customer presentation is the in-page overlay on iPhone.
 * Native file share remains for non-iOS secure contexts only.
 * A: iOS → always preview (HTTP or HTTPS)
 * B: desktop share missing / insecure → download
 * C: desktop share available → share
 */
export function resolveOrderDetailsSavePath(input: {
  isSecureContext: boolean;
  hasShare: boolean;
  canShareFiles: OrderDetailsFileShareCapability;
  isIos: boolean;
}): OrderDetailsSavePath {
  if (input.isIos) return "preview";
  const fileShareOk =
    input.isSecureContext &&
    input.hasShare &&
    input.canShareFiles !== false;
  if (fileShareOk) return "share";
  return "download";
}

function currentIsSecureContext(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  if (typeof globalThis.isSecureContext === "boolean") {
    return globalThis.isSecureContext;
  }
  return true;
}

export function isShareAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}

export function isShareNotAllowedError(error: unknown): boolean {
  return shareErrorName(error) === "NotAllowedError";
}

export function isShareUnavailableError(error: unknown): boolean {
  const name = shareErrorName(error);
  return (
    name === "NotAllowedError" ||
    name === "TypeError" ||
    name === "DataError" ||
    name === "InvalidStateError"
  );
}

function shareErrorName(error: unknown): string | null {
  if (typeof error !== "object" || error == null || !("name" in error)) {
    return null;
  }
  const name = (error as { name?: string }).name;
  return typeof name === "string" ? name : null;
}

export function isIosTouchDevice(
  nav: {
    userAgent?: string;
    platform?: string;
    maxTouchPoints?: number;
  } = globalThis.navigator,
): boolean {
  if (!nav) return false;
  const ua = nav.userAgent ?? "";
  if (/iP(hone|ad|od)/.test(ua)) return true;
  return nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function shareOrDownloadOrderDetailsImage(input: {
  blob: Blob;
  fileName: string;
  title: string;
  nav?: ShareNavigator;
  download?: (blob: Blob, fileName: string) => void;
  createObjectUrl?: (blob: Blob) => string;
  isIos?: boolean;
  isSecureContext?: boolean;
}): Promise<OrderDetailsSaveResult> {
  const file = new File([input.blob], input.fileName, {
    type: "image/png",
    lastModified: Date.now(),
  });
  const nav = input.nav ?? globalThis.navigator;
  const download = input.download ?? triggerBlobDownload;
  const createObjectUrl =
    input.createObjectUrl ?? ((blob) => URL.createObjectURL(blob));
  const isIos = input.isIos ?? isIosTouchDevice();
  const isSecureContext = currentIsSecureContext(input.isSecureContext);
  const path = resolveOrderDetailsSavePath({
    isSecureContext,
    hasShare: typeof nav.share === "function",
    canShareFiles: orderDetailsFileShareCapability(file, nav),
    isIos,
  });

  if (path === "share" && nav.share) {
    try {
      const payload: ShareData = { files: [file] };
      if (input.title && !isIos) payload.title = input.title;
      await nav.share(payload);
      return { action: "shared" };
    } catch (error) {
      if (isShareAbortError(error)) return { action: "shared" };
      if (!isShareUnavailableError(error)) return { action: "shared" };
    }
  }

  if (path === "preview" || isIos) {
    try {
      return {
        action: "preview",
        objectUrl: createObjectUrl(input.blob),
      };
    } catch {
      throw new Error("Could not save order details. Please try again.");
    }
  }

  try {
    download(input.blob, input.fileName);
  } catch {
    throw new Error("Could not save order details. Please try again.");
  }
  return { action: "downloaded" };
}

function canvasPngBlob(canvas: HTMLCanvasElement): Blob {
  const dataUrl = canvas.toDataURL("image/png");
  const marker = "base64,";
  const index = dataUrl.indexOf(marker);
  if (index === -1) {
    throw new Error("Could not create the order details image.");
  }
  const binary = atob(dataUrl.slice(index + marker.length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: "image/png" });
}

function fillTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
): void {
  let cursor = x;
  for (const character of text) {
    ctx.fillText(character, cursor, y);
    cursor += ctx.measureText(character).width + tracking;
  }
}

function fillSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  trackingPx: number,
): void {
  if (trackingPx === 0) {
    ctx.fillText(text, x, y);
    return;
  }
  if ("letterSpacing" in ctx) {
    const previous = ctx.letterSpacing;
    ctx.letterSpacing = `${trackingPx}px`;
    ctx.fillText(text, x, y);
    ctx.letterSpacing = previous;
    return;
  }
  fillTrackedText(ctx, text, x, y, trackingPx);
}

function emTracking(fontPx: number, em: number): number {
  return fontPx * em;
}

function rule(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.strokeStyle = FOG;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD_X, y);
  ctx.lineTo(PAD_X + CONTENT_WIDTH, y);
  ctx.stroke();
}

function pathRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillTextMarking(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  mark: string,
): void {
  const index = text.indexOf(mark);
  if (index < 0) {
    ctx.fillStyle = SKYLINE;
    ctx.fillText(text, x, y);
    return;
  }
  const before = text.slice(0, index);
  const after = text.slice(index + mark.length);
  let cursor = x;
  if (before) {
    ctx.fillStyle = SKYLINE;
    ctx.fillText(before, cursor, y);
    cursor += ctx.measureText(before).width;
  }
  ctx.fillStyle = INK;
  ctx.fillText(mark, cursor, y);
  cursor += ctx.measureText(mark).width;
  if (after) {
    ctx.fillStyle = SKYLINE;
    ctx.fillText(after, cursor, y);
  }
}

function canvasImageNaturalSize(image: CanvasImageSource): {
  width: number;
  height: number;
} {
  const record = image as {
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number;
    height?: number;
  };
  return {
    width: Number(record.naturalWidth || record.width || 0),
    height: Number(record.naturalHeight || record.height || 0),
  };
}

function drawCakePhoto(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  size: number,
): void {
  const { width, height } = canvasImageNaturalSize(image);
  if (!width || !height) return;
  ctx.save();
  pathRoundedRect(ctx, x, y, size, size, 16);
  ctx.clip();
  const side = Math.min(width, height);
  const sx = (width - side) / 2;
  const sy = (height - side) / 2;
  ctx.drawImage(image, sx, sy, side, side, x, y, size, size);
  ctx.restore();
}

export function orderDetailsCakeImageUrls(
  model: OrderDetailsCardModel,
): string[] {
  return [
    ...new Set(
      model.cakes
        .map((line) => line.imageUrl?.trim() ?? "")
        .filter((url) => url.length > 0),
    ),
  ];
}

export async function loadCanvasImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("Image unavailable"));
      return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image"));
    image.src = url;
  });
}

export async function preloadOrderDetailsImages(
  urls: readonly string[],
  loadImage: (url: string) => Promise<CanvasImageSource> = loadCanvasImage,
): Promise<Map<string, CanvasImageSource>> {
  const unique = [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
  const loaded = new Map<string, CanvasImageSource>();
  await Promise.all(
    unique.map(async (url) => {
      try {
        loaded.set(url, await loadImage(url));
      } catch {
        // Omit the photo; keep the rest of the order details.
      }
    }),
  );
  return loaded;
}

type DrawOp = () => void;

function gapScaleForContent(naturalContent: number, available: number): number {
  if (naturalContent <= available) return 1;
  const minScale = 0.58;
  const scale = available / naturalContent;
  return scale < minScale ? minScale : scale;
}

function scaledFontPx(size: number, fontScale: number): number {
  return Math.max(11, Math.round(size * fontScale));
}

export function drawOrderDetailsCard(
  ctx: CanvasRenderingContext2D,
  model: OrderDetailsCardModel,
  images: ReadonlyMap<string, CanvasImageSource> = new Map(),
): { width: number; height: number } {
  const displayFont = storefrontCanvasFontFamily("display");
  const sansFont = storefrontCanvasFontFamily("sans");
  const measure = (font: string, text: string) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };

  const detailRows: OrderDetailsCardRow[] = [
    { label: "Order number", value: model.orderNumber },
    { label: "Order placed", value: model.placedAt },
    { label: "Customer", value: model.customer },
    { label: "WhatsApp", value: model.whatsapp },
    {
      label: "Collection",
      value: `${model.collectionWhen}\n${model.fulfilment}`,
    },
    ...model.collectionExtras,
  ];

  const commerce: Array<{ line: OrderDetailsCardLine; kind: "cake" | "other" }> =
    [
      ...model.cakes.map((line) => ({ line, kind: "cake" as const })),
      ...model.addons.map((line) => ({ line, kind: "other" as const })),
      ...model.complimentary.map((line) => ({ line, kind: "other" as const })),
    ];

  const paint = (gapScale: number, fontScale: number) => {
    const fs = (size: number) => scaledFontPx(size, fontScale);
    const sectionSize = fs(11);
    const brandSize = fs(15);
    const titleSize = fs(46);
    const cakeSize = fs(28);
    const totalSize = fs(34);
    const sectionFont = `500 ${sectionSize}px ${sansFont}`;
    const labelFont = `400 ${fs(11)}px ${sansFont}`;
    const valueFont = `400 ${fs(18)}px ${sansFont}`;
    const cakeNameFont = `400 ${cakeSize}px ${displayFont}`;
    const addonNameFont = `400 ${fs(16)}px ${sansFont}`;
    const metaFont = `400 ${fs(15)}px ${sansFont}`;
    const priceFont = `400 ${fs(17)}px ${displayFont}`;
    const noteFont = `400 ${fs(16)}px ${sansFont}`;
    const paymentFont = `400 ${fs(17)}px ${sansFont}`;
    const contactFont = `400 ${fs(15)}px ${sansFont}`;
    const brandFont = `500 ${brandSize}px ${sansFont}`;
    const titleFont = `400 ${titleSize}px ${displayFont}`;
    const totalLabelFont = `500 ${sectionSize}px ${sansFont}`;
    const totalValueFont = `400 ${totalSize}px ${displayFont}`;
    const wrap = (font: string, text: string, width = CONTENT_WIDTH) =>
      wrapCanvasText((value) => measure(font, value), text, width);

    const ops: DrawOp[] = [];
    let y = 88;
    const block = (comfortable: number) => comfortable * gapScale;
    const line = (comfortable: number) =>
      Math.max(comfortable * 0.88, comfortable * gapScale);

    ops.push(() => {
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, ORDER_DETAILS_PNG_WIDTH, ORDER_DETAILS_PNG_HEIGHT);
    });

    const brandY = y;
    ops.push(() => {
      ctx.fillStyle = SIGNAL;
      ctx.font = brandFont;
      fillSpacedText(
        ctx,
        model.brand,
        PAD_X,
        brandY,
        emTracking(brandSize, 0.22),
      );
    });
    y += line(50);

    const titleY = y;
    ops.push(() => {
      ctx.fillStyle = INK;
      ctx.font = titleFont;
      fillSpacedText(
        ctx,
        model.title,
        PAD_X,
        titleY,
        emTracking(titleSize, -0.02),
      );
    });
    y += line(52);

    const paymentY = y;
    ops.push(() => {
      ctx.fillStyle = SIGNAL;
      ctx.font = paymentFont;
      ctx.fillText(model.paymentStatus, PAD_X, paymentY);
    });
    y += line(26);
    const contactWrapped = wrap(contactFont, model.contactLine);
    for (const contactLine of contactWrapped) {
      const lineY = y;
      ops.push(() => {
        ctx.fillStyle = SKYLINE;
        ctx.font = contactFont;
        ctx.fillText(contactLine, PAD_X, lineY);
      });
      y += line(24);
    }

    y += block(18);
    const noticeTitleFont = `500 ${fs(12)}px ${sansFont}`;
    const noticeBodyFont = `400 ${fs(15)}px ${sansFont}`;
    const noticePadX = 22;
    const noticePadY = 20;
    const noticeInner = CONTENT_WIDTH - noticePadX * 2;
    const noticeBodyLines = wrap(noticeBodyFont, model.noticeBody, noticeInner);
    const noticeBoxH =
      noticePadY +
      line(18) +
      Math.max(noticeBodyLines.length, 1) * line(22) +
      noticePadY;
    const noticeTop = y;
    ops.push(() => {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = FOG;
      ctx.lineWidth = 1.5;
      pathRoundedRect(ctx, PAD_X, noticeTop, CONTENT_WIDTH, noticeBoxH, 18);
      ctx.fill();
      ctx.stroke();
    });
    const noticeTitleY = noticeTop + noticePadY + fs(12);
    ops.push(() => {
      ctx.fillStyle = SIGNAL;
      ctx.font = noticeTitleFont;
      fillSpacedText(
        ctx,
        model.noticeTitle,
        PAD_X + noticePadX,
        noticeTitleY,
        emTracking(fs(12), 0.12),
      );
    });
    let noticeBodyY = noticeTitleY + line(22);
    for (const bodyLine of noticeBodyLines) {
      const lineY = noticeBodyY;
      ops.push(() => {
        ctx.font = noticeBodyFont;
        fillTextMarking(ctx, bodyLine, PAD_X + noticePadX, lineY, "24 hours");
      });
      noticeBodyY += line(22);
    }
    y = noticeTop + noticeBoxH;

    y += block(16);
    const afterHero = y;
    ops.push(() => rule(ctx, afterHero));
    y += block(32);

    const detailsHeadingY = y;
    ops.push(() => {
      ctx.fillStyle = SIGNAL;
      ctx.font = sectionFont;
      fillSpacedText(
        ctx,
        "ORDER DETAILS",
        PAD_X,
        detailsHeadingY,
        emTracking(sectionSize, 0.18),
      );
    });
    y += line(22);

    for (const row of detailRows) {
      const labelY = y;
      ops.push(() => {
        ctx.fillStyle = SKYLINE;
        ctx.font = labelFont;
        fillSpacedText(ctx, row.label, PAD_X, labelY, emTracking(fs(11), 0.06));
      });
      y += line(16);
      const valueLines = wrap(valueFont, row.value);
      for (const valueLine of valueLines.length ? valueLines : ["—"]) {
        const lineY = y;
        ops.push(() => {
          ctx.fillStyle = INK;
          ctx.font = valueFont;
          ctx.fillText(valueLine, PAD_X, lineY);
        });
        y += line(24);
      }
      y += block(10);
    }

    y += block(4);
    const afterDetails = y;
    ops.push(() => rule(ctx, afterDetails));
    y += block(32);

    const orderHeadingY = y;
    ops.push(() => {
      ctx.fillStyle = SIGNAL;
      ctx.font = sectionFont;
      fillSpacedText(
        ctx,
        "YOUR ORDER",
        PAD_X,
        orderHeadingY,
        emTracking(sectionSize, 0.18),
      );
    });
    y += line(26);

    for (const [index, entry] of commerce.entries()) {
      const nameFont = entry.kind === "cake" ? cakeNameFont : addonNameFont;
      const photo =
        entry.kind === "cake" && entry.line.imageUrl
          ? images.get(entry.line.imageUrl)
          : undefined;
      const hasPhoto = Boolean(photo);
      const photoSize = Math.round(
        Math.min(
          140,
          Math.max(96, ORDER_DETAILS_CAKE_PHOTO_SIZE * fontScale),
        ),
      );
      const photoGap = 20;
      const textX = hasPhoto ? PAD_X + photoSize + photoGap : PAD_X;
      const textWidth = hasPhoto
        ? CONTENT_WIDTH - photoSize - photoGap
        : CONTENT_WIDTH;
      const priceWidth = entry.line.price
        ? measure(priceFont, entry.line.price)
        : 0;
      const nameLines = wrap(nameFont, entry.line.name, textWidth);
      const startY = y;
      const photoTop = startY - Math.round(cakeSize * 0.82);
      if (photo) {
        const photoForDraw = photo;
        ops.push(() => {
          drawCakePhoto(ctx, photoForDraw, PAD_X, photoTop, photoSize);
        });
      }
      nameLines.forEach((nameLine, lineIndex) => {
        const lineY = startY + lineIndex * line(entry.kind === "cake" ? 32 : 24);
        ops.push(() => {
          ctx.fillStyle = INK;
          ctx.font = nameFont;
          if (entry.kind === "cake") {
            fillSpacedText(
              ctx,
              nameLine,
              textX,
              lineY,
              emTracking(cakeSize, -0.02),
            );
          } else {
            ctx.fillText(nameLine, textX, lineY);
          }
        });
      });
      y =
        startY +
        Math.max(nameLines.length, 1) *
          line(entry.kind === "cake" ? 32 : 24) +
        block(2);
      const metaY = y;
      const metaMax = textWidth - (priceWidth ? priceWidth + 16 : 0);
      const metaLines = wrap(metaFont, entry.line.meta, metaMax);
      metaLines.forEach((metaLine, lineIndex) => {
        const lineY = metaY + lineIndex * line(20);
        ops.push(() => {
          ctx.fillStyle = SKYLINE;
          ctx.font = metaFont;
          ctx.fillText(metaLine, textX, lineY);
        });
      });
      if (entry.line.price) {
        ops.push(() => {
          ctx.fillStyle = INK;
          ctx.font = priceFont;
          ctx.textAlign = "right";
          ctx.fillText(entry.line.price ?? "", PAD_X + CONTENT_WIDTH, metaY);
          ctx.textAlign = "left";
        });
      }
      const textBottom = metaY + Math.max(metaLines.length, 1) * line(20);
      const photoBottom = hasPhoto ? photoTop + photoSize : textBottom;
      y = Math.max(textBottom, photoBottom);
      y += index === commerce.length - 1 ? block(6) : block(18);
    }

    y += block(8);
    const afterOrder = y;
    ops.push(() => rule(ctx, afterOrder));
    y += block(28);

    const totalLabelY = y;
    ops.push(() => {
      ctx.fillStyle = SKYLINE;
      ctx.font = totalLabelFont;
      fillSpacedText(
        ctx,
        "TOTAL",
        PAD_X,
        totalLabelY,
        emTracking(sectionSize, 0.18),
      );
    });
    const previousSpacing =
      "letterSpacing" in ctx ? ctx.letterSpacing : "0px";
    if ("letterSpacing" in ctx) {
      ctx.letterSpacing = `${emTracking(totalSize, -0.02)}px`;
    }
    const totalWidth = measure(totalValueFont, model.total);
    if ("letterSpacing" in ctx) {
      ctx.letterSpacing = previousSpacing;
    }
    ops.push(() => {
      ctx.fillStyle = INK;
      ctx.font = totalValueFont;
      fillSpacedText(
        ctx,
        model.total,
        PAD_X + CONTENT_WIDTH - totalWidth,
        totalLabelY + 6,
        emTracking(totalSize, -0.02),
      );
    });
    y += line(36);

    const noteLines = model.notes ? wrap(noteFont, model.notes) : [];
    if (noteLines.length > 0) {
      const afterTotal = y;
      ops.push(() => rule(ctx, afterTotal));
      y += block(28);
      const noteHeadingY = y;
      ops.push(() => {
        ctx.fillStyle = SIGNAL;
        ctx.font = sectionFont;
        fillSpacedText(
          ctx,
          "NOTE",
          PAD_X,
          noteHeadingY,
          emTracking(sectionSize, 0.18),
        );
      });
      y += line(24);
      for (const noteLine of noteLines) {
        const lineY = y;
        ops.push(() => {
          ctx.fillStyle = INK;
          ctx.font = noteFont;
          ctx.fillText(noteLine, PAD_X, lineY);
        });
        y += line(22);
      }
    }

    return { ops, y, titleY };
  };

  const footerY = ORDER_DETAILS_PNG_HEIGHT - 52;
  const available = footerY - 36;
  const natural = paint(1, 1);
  let fitted = natural;
  if (natural.y > available) {
    fitted = paint(gapScaleForContent(natural.y, available), 1);
  }
  if (fitted.y > available) {
    fitted = paint(
      gapScaleForContent(natural.y, available),
      Math.max(0.88, available / fitted.y),
    );
  }

  const footerFont = `400 13px ${sansFont}`;

  fitted.ops.push(() => {
    ctx.fillStyle = SKYLINE;
    ctx.font = footerFont;
    ctx.fillText(model.footer, PAD_X, footerY);
  });

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const op of fitted.ops) op();
  ctx.restore();

  return {
    width: ORDER_DETAILS_PNG_WIDTH,
    height: ORDER_DETAILS_PNG_HEIGHT,
  };
}

export function renderOrderDetailsPng(
  model: OrderDetailsCardModel,
  images: ReadonlyMap<string, CanvasImageSource> = new Map(),
): Blob {
  const canvas = document.createElement("canvas");
  canvas.width = ORDER_DETAILS_PNG_WIDTH;
  canvas.height = ORDER_DETAILS_PNG_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create the order details image.");
  }
  drawOrderDetailsCard(ctx, model, images);
  return canvasPngBlob(canvas);
}
