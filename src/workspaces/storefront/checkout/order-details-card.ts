import { dineInVenueLabel } from "@/engines/business-calendar/dine-in-hours";
import { workspaceFulfilmentSectionTitle } from "@/engines/orders/fulfilment";
import { formatDdMmYyyy } from "@/lib/dates";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { GuestPreorderReceipt } from "@/workspaces/storefront/checkout/receipt";

export const ORDER_DETAILS_CARD_FOOTER = "Please keep this for your reference.";

const PAPER = "#f5f0e9";
const INK = "#1c1916";
const SKYLINE = "#5a534c";
const FOG = "#ddd4c8";

const CARD_WIDTH = 540;
const PAD_X = 40;
const SCALE = 2;

const DISPLAY_FONT = 'Georgia, "Palatino Linotype", Palatino, serif';
const BODY_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export type OrderDetailsCardLine = {
  name: string;
  meta: string;
  price: string | null;
};

export type OrderDetailsCardRow = {
  label: string;
  value: string;
};

export type OrderDetailsCardModel = {
  brand: string;
  title: string;
  rows: OrderDetailsCardRow[];
  cakes: OrderDetailsCardLine[];
  addons: OrderDetailsCardLine[];
  total: string;
  notes: string | null;
  footer: string;
};

export function buildOrderDetailsCardModel(
  receipt: GuestPreorderReceipt,
): OrderDetailsCardModel {
  const rows: OrderDetailsCardRow[] = [
    {
      label: "Order number",
      value: receipt.orderNumber?.trim() || "—",
    },
    {
      label: "Customer name",
      value: receipt.guestName.trim() || "—",
    },
    {
      label: "WhatsApp number",
      value: receipt.guestPhone.trim() || "—",
    },
    {
      label: "Collection date",
      value: formatDdMmYyyy(receipt.pickupDate),
    },
    {
      label: "Collection time",
      value: formatPickupTime(receipt.pickupTime),
    },
    {
      label: "Fulfilment method",
      value: workspaceFulfilmentSectionTitle(receipt.fulfilmentMethod),
    },
  ];
  if (receipt.fulfilmentMethod === "dine_in" && receipt.reservationTime) {
    rows.push({
      label: "Reservation time",
      value: formatPickupTime(receipt.reservationTime),
    });
  }
  if (receipt.fulfilmentMethod === "dine_in" && receipt.dineInVenue) {
    rows.push({
      label: "Venue",
      value: dineInVenueLabel(receipt.dineInVenue),
    });
  }
  if (receipt.fulfilmentMethod === "dine_in" && receipt.guestCount != null) {
    rows.push({
      label: "Guests",
      value: `${receipt.guestCount} ${receipt.guestCount === 1 ? "guest" : "guests"}`,
    });
  }

  return {
    brand: "WHITEBIRD",
    title: "Order Received",
    rows,
    cakes: receipt.items.map((item) => ({
      name: item.cakeName,
      meta: `${item.sizeLabel} · × ${item.quantity}`,
      price:
        item.unitPrice != null
          ? formatRm(item.unitPrice * item.quantity)
          : null,
    })),
    addons: receipt.paidAddons.map((addon) => ({
      name: addon.name,
      meta: `× ${addon.quantity}`,
      price: formatRm(addon.unitPrice * addon.quantity),
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
  const words = input.split(/\s+/);
  const lines: string[] = [];
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
  if (current) lines.push(current);
  return lines;
}

type ShareNavigator = {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
};

export function canShareOrderDetailsFile(
  file: File,
  nav: ShareNavigator | undefined = globalThis.navigator,
): boolean {
  if (!nav?.share || typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function isShareAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
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
}): Promise<"shared" | "downloaded"> {
  const file = new File([input.blob], input.fileName, { type: "image/png" });
  const nav = input.nav ?? globalThis.navigator;
  const download = input.download ?? triggerBlobDownload;
  if (canShareOrderDetailsFile(file, nav) && nav.share) {
    try {
      await nav.share({
        files: [file],
        title: input.title,
      });
      return "shared";
    } catch (error) {
      if (isShareAbortError(error)) return "shared";
    }
  }
  download(input.blob, input.fileName);
  return "downloaded";
}

function rule(ctx: CanvasRenderingContext2D, y: number, width: number): void {
  ctx.strokeStyle = FOG;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD_X, y);
  ctx.lineTo(PAD_X + width, y);
  ctx.stroke();
}

export function drawOrderDetailsCard(
  ctx: CanvasRenderingContext2D,
  model: OrderDetailsCardModel,
): { width: number; height: number } {
  const contentWidth = CARD_WIDTH - PAD_X * 2;
  ctx.save();
  ctx.scale(SCALE, SCALE);

  const measure = (font: string, text: string) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  };

  type DrawOp = () => void;
  const ops: DrawOp[] = [];
  let y = 36;

  const pushGap = (size: number) => {
    y += size;
  };

  ops.push(() => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, CARD_WIDTH, 10_000);
  });

  ops.push(() => {
    ctx.fillStyle = SKYLINE;
    ctx.font = `500 11px ${BODY_FONT}`;
    ctx.fillText(model.brand, PAD_X, y);
  });
  y += 28;

  ops.push(() => {
    ctx.fillStyle = INK;
    ctx.font = `400 28px ${DISPLAY_FONT}`;
    ctx.fillText(model.title, PAD_X, y);
  });
  y += 22;
  const afterTitle = y;
  ops.push(() => rule(ctx, afterTitle, contentWidth));
  y += 22;

  for (const row of model.rows) {
    const labelFont = `500 12px ${BODY_FONT}`;
    const valueFont = `400 15px ${BODY_FONT}`;
    const valueLines = wrapCanvasText(
      (text) => measure(valueFont, text),
      row.value,
      contentWidth,
    );
    const rowY = y;
    ops.push(() => {
      ctx.fillStyle = SKYLINE;
      ctx.font = labelFont;
      ctx.fillText(row.label, PAD_X, rowY);
    });
    y += 18;
    for (const line of valueLines.length ? valueLines : ["—"]) {
      const lineY = y;
      ops.push(() => {
        ctx.fillStyle = INK;
        ctx.font = valueFont;
        ctx.fillText(line, PAD_X, lineY);
      });
      y += 20;
    }
    y += 8;
  }

  const afterMeta = y;
  ops.push(() => rule(ctx, afterMeta, contentWidth));
  y += 20;

  const drawCommerceLine = (line: OrderDetailsCardLine) => {
    const nameFont = `500 15px ${DISPLAY_FONT}`;
    const metaFont = `400 12px ${BODY_FONT}`;
    const priceFont = `400 14px ${BODY_FONT}`;
    const priceWidth = line.price ? measure(priceFont, line.price) : 0;
    const nameWidth = contentWidth - (priceWidth ? priceWidth + 12 : 0);
    const nameLines = wrapCanvasText(
      (text) => measure(nameFont, text),
      line.name,
      nameWidth,
    );
    const startY = y;
    nameLines.forEach((nameLine, index) => {
      const lineY = startY + index * 20;
      ops.push(() => {
        ctx.fillStyle = INK;
        ctx.font = nameFont;
        ctx.fillText(nameLine, PAD_X, lineY);
      });
    });
    if (line.price) {
      ops.push(() => {
        ctx.fillStyle = INK;
        ctx.font = priceFont;
        ctx.fillText(
          line.price ?? "",
          PAD_X + contentWidth - priceWidth,
          startY,
        );
      });
    }
    y = startY + Math.max(nameLines.length, 1) * 20 + 2;
    const metaY = y;
    ops.push(() => {
      ctx.fillStyle = SKYLINE;
      ctx.font = metaFont;
      ctx.fillText(line.meta, PAD_X, metaY);
    });
    y += 22;
  };

  for (const cake of model.cakes) {
    drawCommerceLine(cake);
  }
  for (const addon of model.addons) {
    drawCommerceLine(addon);
  }

  const afterLines = y;
  ops.push(() => rule(ctx, afterLines, contentWidth));
  y += 24;

  const totalLabel = "Total";
  ops.push(() => {
    ctx.fillStyle = SKYLINE;
    ctx.font = `500 12px ${BODY_FONT}`;
    ctx.fillText(totalLabel, PAD_X, y);
  });
  const totalWidth = measure(`400 22px ${DISPLAY_FONT}`, model.total);
  const totalY = y;
  ops.push(() => {
    ctx.fillStyle = INK;
    ctx.font = `400 22px ${DISPLAY_FONT}`;
    ctx.fillText(model.total, PAD_X + contentWidth - totalWidth, totalY);
  });
  y += 28;

  if (model.notes) {
    const afterTotal = y;
    ops.push(() => rule(ctx, afterTotal, contentWidth));
    y += 20;
    ops.push(() => {
      ctx.fillStyle = SKYLINE;
      ctx.font = `500 12px ${BODY_FONT}`;
      ctx.fillText("Notes", PAD_X, y);
    });
    y += 18;
    const noteLines = wrapCanvasText(
      (text) => measure(`400 14px ${BODY_FONT}`, text),
      model.notes,
      contentWidth,
    );
    for (const line of noteLines) {
      const lineY = y;
      ops.push(() => {
        ctx.fillStyle = INK;
        ctx.font = `400 14px ${BODY_FONT}`;
        ctx.fillText(line, PAD_X, lineY);
      });
      y += 20;
    }
    y += 8;
  }

  const afterBody = y + 4;
  ops.push(() => rule(ctx, afterBody, contentWidth));
  y = afterBody + 22;
  ops.push(() => {
    ctx.fillStyle = SKYLINE;
    ctx.font = `400 12px ${BODY_FONT}`;
    ctx.fillText(model.footer, PAD_X, y);
  });
  y += 36;

  const height = y;
  ops[0] = () => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, CARD_WIDTH, height);
  };
  for (const op of ops) op();
  ctx.restore();
  return { width: CARD_WIDTH * SCALE, height: height * SCALE };
}

export function renderOrderDetailsPng(
  model: OrderDetailsCardModel,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const probe = canvas.getContext("2d");
  if (!probe) {
    return Promise.reject(
      new Error("Could not create the order details image."),
    );
  }
  canvas.width = CARD_WIDTH * SCALE;
  canvas.height = 2400 * SCALE;
  const measured = drawOrderDetailsCard(probe, model);
  canvas.width = measured.width;
  canvas.height = measured.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(
      new Error("Could not create the order details image."),
    );
  }
  drawOrderDetailsCard(ctx, model);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not create the order details image."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}
