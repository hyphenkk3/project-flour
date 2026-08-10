import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import {
  commercialEquationItems,
  formatOrderFinancialEquation,
} from "@/engines/orders/financial-equation";
import {
  messagesForQuantity,
  normalizeWrittenMessage,
} from "@/engines/orders/paid-addons";
import { getEffectiveAdjustments } from "@/engines/orders/promotions";
import { normalizePaidAddonLines } from "@/engines/orders/totals";
import type {
  ConfirmationPayload,
  OrderAdjustment,
  StorefrontOrder,
} from "@/types/storefront";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MESSAGE_SEPARATOR = "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~";

function parseYmd(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** e.g. 14/8 (no leading zero on day/month, Whitebird style) */
export function formatPickupDateShort(ymd: string): string {
  const date = parseYmd(ymd);
  if (!date) return ymd;
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

export function formatPickupWeekdayShort(ymd: string): string {
  const date = parseYmd(ymd);
  if (!date) return "";
  return WEEKDAY_SHORT[date.getDay()] ?? "";
}

export function formatComplimentaryLine(
  items: Array<{ name: string; quantity: number }>,
): string | null {
  const active = items.filter((item) => item.quantity > 0);
  if (active.length === 0) return null;
  return active
    .map((item) => `${item.name} x${item.quantity}`)
    .join(", ");
}

/** Cake + paid-add-on commercial lines under Whole Cake; (no separate Add-ons heading). */
export function formatConfirmationCommercialLines(input: {
  items: ConfirmationPayload["items"];
  paidAddons?: ConfirmationPayload["paidAddons"];
}): string {
  const cakeLines = input.items.map(
    (item) => `~ ${item.cakeName} ${item.sizeLabel} x${item.quantity}`,
  );
  const addonLines = normalizePaidAddonLines(input.paidAddons).map(
    (addon) => `~ ${addon.name} x${addon.quantity}`,
  );
  return [...cakeLines, ...addonLines].join("\n");
}

/**
 * Label for one physical card's written-message Special Request entry.
 * qty 1 → no index suffix; qty >1 → " Card {n}".
 */
export function formatWrittenMessageOnCardLabel(input: {
  addonName: string;
  quantity: number;
  cardIndex: number;
}): string {
  const qty = Math.max(1, Math.floor(Number(input.quantity) || 1));
  if (qty <= 1) {
    return `~Written message on ${input.addonName}:`;
  }
  return `~Written message on ${input.addonName} ${input.cardIndex}:`;
}

export function formatWrittenMessageEntry(input: {
  addonName: string;
  quantity: number;
  cardIndex: number;
  message: string;
}): string {
  return (
    `${formatWrittenMessageOnCardLabel(input)}\n\n` +
    `${MESSAGE_SEPARATOR}\n\n` +
    `${input.message}\n\n` +
    `${MESSAGE_SEPARATOR}`
  );
}

type ConfirmationAddonForMessages = {
  name: string;
  quantity: number;
  writtenMessage?: string | null;
  messages?: Array<{
    cardIndex: number;
    writtenMessage: string | null;
  }>;
};

/** Collect non-empty per-card messages in commercial-line / card_index order. */
export function collectConfirmationCardMessages(
  paidAddons: ConfirmationAddonForMessages[] | null | undefined,
): Array<{
  addonName: string;
  quantity: number;
  cardIndex: number;
  message: string;
}> {
  const rows: Array<{
    addonName: string;
    quantity: number;
    cardIndex: number;
    message: string;
  }> = [];

  for (const addon of normalizePaidAddonLines(paidAddons)) {
    const quantity = Math.max(1, Math.floor(Number(addon.quantity) || 1));
    const slots = messagesForQuantity(
      addon.messages,
      quantity,
      addon.writtenMessage,
    );
    for (let i = 0; i < quantity; i += 1) {
      const message = normalizeWrittenMessage(slots[i]);
      if (!message) continue;
      rows.push({
        addonName: addon.name,
        quantity,
        cardIndex: i + 1,
        message,
      });
    }
  }

  return rows;
}

/**
 * Special Request block for non-empty card messages only.
 * Returns null when no messages → omit entirely.
 */
export function formatConfirmationSpecialRequestBlock(
  paidAddons: ConfirmationPayload["paidAddons"],
): string | null {
  const entries = collectConfirmationCardMessages(paidAddons);
  if (entries.length === 0) return null;
  const body = entries
    .map((entry) => formatWrittenMessageEntry(entry))
    .join("\n\n");
  return `⭐️Special Request:⭐️\n${body}`;
}

/**
 * Customer-facing financial block for confirmation.
 * Full item + adjustment equation (shared with Crew amount head).
 * No payment / NYP / c/o notation.
 */
export function formatConfirmationFinancialBlock(
  payload: Pick<
    ConfirmationPayload,
    "items" | "paidAddons" | "subtotal" | "amountDue" | "adjustments" | "total"
  >,
): string {
  const amountDue = payload.amountDue ?? payload.total;
  const adjustments = payload.adjustments ?? [];
  const paidAddons = normalizePaidAddonLines(payload.paidAddons);
  return formatOrderFinancialEquation({
    items: commercialEquationItems({
      cakes: payload.items,
      paidAddons: paidAddons.map((row) => ({
        unitPrice: row.unitPrice,
        quantity: row.quantity,
        financialShorthand: row.financialShorthand,
      })),
    }),
    effective: adjustments.map((row) => ({
      label: row.label,
      amount: row.amount,
      code: row.code ?? "",
      metadata: row.metadata ?? {},
    })),
    amountDue,
  });
}

/**
 * Generates the Whitebird WhatsApp confirmation message body.
 * Preserve tone — do not rewrite into generic e-commerce language.
 */
export function generateConfirmationMessage(
  payload: ConfirmationPayload,
): string {
  const weekday = formatPickupWeekdayShort(payload.pickupDate);
  const dateShort = formatPickupDateShort(payload.pickupDate);
  const timeLabel = formatPickupTime(payload.pickupTime);
  const financialBlock = formatConfirmationFinancialBlock(payload);
  const commercialLines = formatConfirmationCommercialLines({
    items: payload.items,
    paidAddons: payload.paidAddons,
  });
  const specialRequest = formatConfirmationSpecialRequestBlock(
    payload.paidAddons,
  );
  const specialRequestBlock = specialRequest ? `\n${specialRequest}\n` : "\n";

  const complimentary = formatComplimentaryLine(payload.complimentaryItems);
  const complimentaryBlock = complimentary
    ? `\n*Complimentary ${complimentary}\n`
    : "\n";

  return (
    `Hello ${payload.staffCustomerFacingName} here,\n\n` +
    `We've received your cakes preorder submission via online system. ;)\n\n` +
    `Here's the order confirmation.\n\n` +
    `🟠Pick-up order: ${dateShort} (${weekday})\n\n` +
    `Ordered by: ${payload.customerName}\n` +
    `Phone No: ${payload.customerPhone}\n` +
    `Time: ${timeLabel}\n\n` +
    `Whole Cake;\n` +
    `${commercialLines}\n` +
    specialRequestBlock +
    `${financialBlock}\n` +
    complimentaryBlock +
    `\n` +
    `Kindly review ALL the details in this confirmation carefully, as your order will be prepared based on the information provided above.\n\n` +
    `Once confirmed, any amendments or errors will not be our responsibility.\n` +
    `Important: Voucher orders are final and cannot be amended under any circumstances.\n\n` +
    `We will proceed with payment once everything is confirmed 😊`
  );
}

export function buildConfirmationPayload(input: {
  staffCustomerFacingName: string;
  customerName: string;
  customerPhone: string;
  pickupDate: string;
  pickupTime: string;
  items: ConfirmationPayload["items"];
  complimentaryItems: ConfirmationPayload["complimentaryItems"];
  paidAddons?: ConfirmationPayload["paidAddons"];
  /** Commercial subtotal (cakes + paid add-ons). */
  subtotal: number;
  /** Effective adjustments only. */
  adjustments: ConfirmationPayload["adjustments"];
  /** Authoritative settlement amount due. */
  amountDue: number;
}): ConfirmationPayload {
  return {
    staffCustomerFacingName: input.staffCustomerFacingName.trim() || "Whitebird",
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    pickupDate: input.pickupDate,
    pickupTime: input.pickupTime,
    items: input.items,
    complimentaryItems: input.complimentaryItems.filter(
      (item) => item.quantity > 0,
    ),
    paidAddons: normalizePaidAddonLines(input.paidAddons),
    subtotal: input.subtotal,
    adjustments: input.adjustments,
    amountDue: input.amountDue,
    /** Snapshot compatibility: total = payable amount due. */
    total: input.amountDue,
  };
}

/** Build confirmation payload from live StorefrontOrder + staff name. */
export function buildConfirmationPayloadFromOrder(input: {
  order: StorefrontOrder;
  staffCustomerFacingName: string;
}): ConfirmationPayload {
  const { order } = input;
  const effective = getEffectiveAdjustments(order.adjustments);
  return buildConfirmationPayload({
    staffCustomerFacingName: input.staffCustomerFacingName,
    customerName: order.customerName,
    customerPhone: order.phone,
    pickupDate: order.pickupDate,
    pickupTime: order.pickupTime,
    items: order.items.map((item) => ({
      cakeName: item.cakeName,
      sizeLabel: item.sizeLabel,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    complimentaryItems: order.complimentaryItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
    })),
    paidAddons: normalizePaidAddonLines(order.paidAddons).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      financialShorthand: item.financialShorthand,
      writtenMessage: item.writtenMessage,
      messages: (item.messages ?? []).map((m) => ({
        cardIndex: m.cardIndex,
        writtenMessage: m.writtenMessage,
      })),
    })),
    subtotal: order.settlement.subtotal,
    adjustments: effective.map((row: OrderAdjustment) => ({
      label: row.label,
      amount: row.amount,
      code: row.code,
      metadata: row.metadata,
    })),
    amountDue: order.settlement.amountDue,
  });
}
