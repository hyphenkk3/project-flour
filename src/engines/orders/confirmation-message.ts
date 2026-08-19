import { dineInVenueLabel } from "@/engines/business-calendar/dine-in-hours";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import {
  commercialEquationItems,
  formatOrderFinancialEquation,
} from "@/engines/orders/financial-equation";
import {
  DELIVERY_FEE_WAIVED_LINE,
  formatDeliveryFinanceWaiverLines,
  PROCESSING_FEE_WAIVED_LINE,
} from "@/engines/orders/delivery-finance";
import {
  isDeliveryRecipientSameAsOrderingCustomer,
} from "@/engines/orders/fulfilment";
import {
  messagesForQuantity,
  normalizeWrittenMessage,
} from "@/engines/orders/paid-addons";
import { getEffectiveAdjustments } from "@/engines/orders/promotions";
import { normalizePaidAddonLines } from "@/engines/orders/totals";
import type {
  ConfirmationPayload,
  OrderAdjustment,
  RecipientNotifyPreference,
  StorefrontOrder,
  StorefrontOrderDelivery,
  StorefrontOrderDineInReservation,
  StorefrontOrderFulfilmentMethod,
} from "@/types/storefront";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MESSAGE_SEPARATOR = "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~";

/**
 * Shared Confirmation section rails — opening and closing MUST be identical.
 * Product-approved long underscore separator (60 characters).
 */
export const CONFIRMATION_SECTION_SEPARATOR =
  "____________________________________________________________";

/** Single customer-facing order-type colour. Not month-coded. */
export const CUSTOMER_ORDER_TYPE_COLOUR = "🟠";
export const CUSTOMER_PICKUP_ORDER_MARKER = "🟠 Pick-up order:";
export const CUSTOMER_DELIVERY_ORDER_MARKER = "🟠🚗 Delivery order:";
export const CUSTOMER_DINE_IN_ORDER_MARKER = "🟠🍽️ Dine-In order:";

export const DINE_IN_RESERVATION_INCLUDED_COPY =
  "Dine-in reservation is included — your reservation is made together with your cake order. No separate reservation is needed.";

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

function gcdPositive(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

/**
 * Customer confirmation complimentary line.
 * Equal quantities collapse into sets: (Topper x1, Candle x1, Knife x1) × 2 sets.
 */
export function formatCustomerConfirmationComplimentaryLine(
  items: Array<{ name: string; quantity: number }>,
): string | null {
  const active = items.filter((item) => item.quantity > 0);
  if (active.length === 0) return null;
  const quantities = active.map((item) =>
    Math.max(1, Math.floor(Number(item.quantity) || 1)),
  );
  const setCount = quantities.reduce((acc, qty) => gcdPositive(acc, qty));
  const inner = active
    .map((item, index) => `${item.name} x${quantities[index]! / setCount}`)
    .join(", ");
  if (setCount > 1) {
    return `*Complimentary (${inner}) × ${setCount} sets`;
  }
  return `*Complimentary ${inner}`;
}

export function formatCustomerDineInReservationFooter(input: {
  customerName: string;
  dineInReservation: StorefrontOrderDineInReservation;
}): string {
  const reservation = input.dineInReservation;
  const timeLabel = formatPickupTime(reservation.reservationTime);
  const venue = dineInVenueLabel(reservation.venue);
  const lines = [
    `* Dine-in reservation: ${timeLabel} @ ${venue}`,
    `* Guests: ${reservation.guestCount}`,
  ];
  const note = reservation.reservationNote?.trim();
  if (note) lines.push(`* ${note}`);
  lines.push(DINE_IN_RESERVATION_INCLUDED_COPY);
  return lines.join("\n");
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

export const PROCESSING_FEE_WAIVED_CONFIRMATION_LINE =
  PROCESSING_FEE_WAIVED_LINE;
export const DELIVERY_FEE_WAIVED_CONFIRMATION_LINE = DELIVERY_FEE_WAIVED_LINE;

/**
 * Customer-facing waiver traceability after the equation.
 * Only canonical deliberate waivers — never NOT SET / RM0 inference.
 * Processing first, then Delivery. Returns null when none apply.
 */
export function formatConfirmationDeliveryFinanceWaiverLines(input: {
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod | string | null;
  delivery?: StorefrontOrderDelivery | null;
}): string | null {
  return formatDeliveryFinanceWaiverLines(input);
}

/**
 * Equation plus optional waiver lines (immediately after, no blank line).
 */
export function formatConfirmationAmountSection(
  payload: Pick<
    ConfirmationPayload,
    | "items"
    | "paidAddons"
    | "subtotal"
    | "amountDue"
    | "adjustments"
    | "total"
    | "fulfilmentMethod"
    | "delivery"
  >,
): string {
  const equation = formatConfirmationFinancialBlock(payload);
  const waivers = formatConfirmationDeliveryFinanceWaiverLines(payload);
  return waivers ? `${equation}\n${waivers}` : equation;
}

/**
 * Customer-facing financial block for confirmation.
 * Full item + adjustment equation (shared with Crew amount head).
 * No payment / NYP / c/o notation. Waiver lines are not part of the equation.
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
 * Pickup + Delivery share identical section separators and spacing rhythm.
 */
export function generateConfirmationMessage(
  payload: ConfirmationPayload,
): string {
  const weekday = formatPickupWeekdayShort(payload.pickupDate);
  const dateShort = formatPickupDateShort(payload.pickupDate);
  const timeLabel = formatPickupTime(payload.pickupTime);
  const amountSection = formatConfirmationAmountSection(payload);
  const commercialLines = formatConfirmationCommercialLines({
    items: payload.items,
    paidAddons: payload.paidAddons,
  });
  const specialRequest = formatConfirmationSpecialRequestBlock(
    payload.paidAddons,
  );

  const isDelivery = payload.fulfilmentMethod === "delivery";
  const isDineIn = payload.fulfilmentMethod === "dine_in";
  const samePerson =
    isDelivery &&
    isDeliveryRecipientSameAsOrderingCustomer({
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      delivery: payload.delivery,
    });
  const showDeliveryNotify = Boolean(
    isDelivery && payload.delivery && !samePerson,
  );

  const complimentary = formatCustomerConfirmationComplimentaryLine(
    payload.complimentaryItems,
  );
  const notifyInstruction = showDeliveryNotify
    ? formatConfirmationRecipientNotifyInstruction(
        payload.delivery!.recipientNotifyPreference,
      )
    : null;

  // Complimentary + Include RECEIPT + Delivery notify are adjacent (no blank line between).
  const postAmountLines: string[] = [];
  if (complimentary) {
    postAmountLines.push(complimentary);
  }
  if (payload.includeReceipt) {
    postAmountLines.push("*Include RECEIPT");
  }
  if (notifyInstruction) {
    postAmountLines.push(notifyInstruction);
  }
  const postAmountBlock =
    postAmountLines.length > 0 ? postAmountLines.join("\n") : null;

  const fulfilmentBlock = formatConfirmationFulfilmentBlock({
    fulfilmentMethod: payload.fulfilmentMethod,
    delivery: payload.delivery,
    dineInReservation: payload.dineInReservation,
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    pickupDate: payload.pickupDate,
    pickupTime: payload.pickupTime,
    dateShort,
    weekday,
    timeLabel,
  });

  // Order section (between identical separators).
  let orderSection =
    `${fulfilmentBlock}\n\n` +
    `Whole Cake;\n` +
    `${commercialLines}`;
  if (specialRequest) {
    orderSection += `\n\n${specialRequest}`;
  }
  orderSection += `\n\n${amountSection}`;
  if (postAmountBlock) {
    orderSection += `\n\n${postAmountBlock}`;
  }
  if (isDineIn && payload.dineInReservation) {
    orderSection += `\n\n${formatCustomerDineInReservationFooter({
      customerName: payload.customerName,
      dineInReservation: payload.dineInReservation,
    })}`;
  }

  return (
    `Hello ${payload.staffCustomerFacingName} here,\n\n` +
    `We've received your cakes preorder submission via online system. ;)\n\n` +
    `Here's the order confirmation.\n\n` +
    `${CONFIRMATION_SECTION_SEPARATOR}\n\n` +
    `${orderSection}\n\n` +
    `${CONFIRMATION_SECTION_SEPARATOR}\n\n` +
    `Kindly review ALL the details in this confirmation carefully, as your order will be prepared based on the information provided above.\n\n` +
    `Once confirmed, any amendments or errors will not be our responsibility.\n` +
    `Important: Voucher orders are final and cannot be amended under any circumstances.\n\n` +
    `We will proceed with payment once everything is confirmed 😊`
  );
}

/**
 * Customer-facing Confirmation address — entered lines + postcode only.
 * Omits persisted KK/Sabah (internal normalization remains in DB / Workspace).
 */
export function formatConfirmationDeliveryAddress(
  delivery: StorefrontOrderDelivery,
): string {
  const parts: string[] = [];
  const line1 = String(delivery.addressLine1 ?? "").trim();
  const line2 = String(delivery.addressLine2 ?? "").trim();
  const postcode = String(delivery.postcode ?? "").trim();
  if (line1) parts.push(line1);
  if (line2) parts.push(line2);
  if (postcode) parts.push(postcode);
  return parts.join(", ");
}

/** Product-approved different-recipient notify lines (customer Confirmation). */
export function formatConfirmationRecipientNotifyInstruction(
  preference: RecipientNotifyPreference,
): string {
  if (preference === "do_not_inform_recipient") {
    return "*DO NOT inform Recipient (It's a Surprise!)";
  }
  return "*Inform Recipient before delivery.";
}

/**
 * Fulfilment header + identity/address block.
 * Missing fulfilmentMethod → Pickup (historical snapshots).
 * Explicit delivery method never falsifies to Pickup.
 *
 * Delivery identity rows are consecutive (no blank lines between).
 * Exactly one blank line after Time is provided by the caller before Whole Cake.
 */
export function formatConfirmationFulfilmentBlock(input: {
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod | null;
  delivery?: StorefrontOrderDelivery | null;
  dineInReservation?: StorefrontOrderDineInReservation | null;
  customerName: string;
  customerPhone: string;
  pickupDate: string;
  pickupTime: string;
  dateShort: string;
  weekday: string;
  timeLabel: string;
}): string {
  if (input.fulfilmentMethod === "dine_in") {
    return (
      `${CUSTOMER_DINE_IN_ORDER_MARKER} ${input.dateShort} (${input.weekday})\n\n` +
      `Ordered by: ${input.customerName}\n` +
      `Phone No: ${input.customerPhone}\n` +
      `Cake serving time: ${input.timeLabel}`
    );
  }

  const isDelivery = input.fulfilmentMethod === "delivery";
  if (!isDelivery) {
    return (
      `${CUSTOMER_PICKUP_ORDER_MARKER} ${input.dateShort} (${input.weekday})\n\n` +
      `Ordered by: ${input.customerName}\n` +
      `Phone No: ${input.customerPhone}\n` +
      `Time: ${input.timeLabel}`
    );
  }

  const header = `${CUSTOMER_DELIVERY_ORDER_MARKER} ${input.dateShort} (${input.weekday})`;
  const delivery = input.delivery ?? null;
  const samePerson = isDeliveryRecipientSameAsOrderingCustomer({
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    delivery,
  });

  const lines: string[] = [header, ""];

  if (samePerson && delivery) {
    lines.push(`Ordered by/ Recipient: ${input.customerName}`);
    lines.push(`Phone No: ${input.customerPhone}`);
    lines.push(`Address: ${formatConfirmationDeliveryAddress(delivery)}`);
    lines.push(`Time: ${input.timeLabel}`);
  } else if (delivery) {
    lines.push(`Ordered by: ${input.customerName}`);
    lines.push(`Phone No: ${input.customerPhone}`);
    lines.push(`Recipient: ${delivery.recipientName}`);
    lines.push(`Recipient Phone No: ${delivery.recipientPhone}`);
    lines.push(`Address: ${formatConfirmationDeliveryAddress(delivery)}`);
    lines.push(`Time: ${input.timeLabel}`);
  } else {
    // Explicit Delivery without details — still never say Pick-up.
    lines.push(`Ordered by: ${input.customerName}`);
    lines.push(`Phone No: ${input.customerPhone}`);
    lines.push(`Time: ${input.timeLabel}`);
  }

  return lines.join("\n");
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
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod;
  delivery?: StorefrontOrderDelivery | null;
  dineInReservation?: StorefrontOrderDineInReservation | null;
  includeReceipt?: boolean;
}): ConfirmationPayload {
  return {
    staffCustomerFacingName: input.staffCustomerFacingName.trim() || "Whitebird",
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    pickupDate: input.pickupDate,
    pickupTime: input.pickupTime,
    fulfilmentMethod: input.fulfilmentMethod,
    delivery: input.delivery ?? null,
    dineInReservation: input.dineInReservation ?? null,
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
    includeReceipt: Boolean(input.includeReceipt),
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
    fulfilmentMethod: order.fulfilmentMethod,
    delivery: order.delivery,
    dineInReservation: order.dineInReservation,
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
    includeReceipt: order.includeReceipt,
  });
}
