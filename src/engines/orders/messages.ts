import { dineInVenueLabel } from "@/engines/business-calendar/dine-in-hours";
import {
  formatPickupDateShort,
  formatPickupWeekdayShort,
  formatComplimentaryLine,
} from "@/engines/orders/confirmation-message";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import { formatDeliveryFinanceWaiverLines } from "@/engines/orders/delivery-finance";
import {
  isDeliveryRecipientSameAsOrderingCustomer,
} from "@/engines/orders/fulfilment";
import {
  formatItemPriceComponent,
  formatOrderFinancialEquation,
  commercialEquationItems,
  type FinancialEquationItem,
} from "@/engines/orders/financial-equation";
import { paymentMethodLabel } from "@/engines/orders/payment-details";
import {
  messagesForQuantity,
  normalizeWrittenMessage,
} from "@/engines/orders/paid-addons";
import { getEffectiveAdjustments } from "@/engines/orders/promotions";
import {
  formatOrderTotal,
  normalizePaidAddonLines,
} from "@/engines/orders/totals";
import { normalizePickupTimeValue } from "@/engines/business-calendar/pickup-slots";
import type {
  OrderAdjustment,
  OrderPaymentAllocationView,
  OrderSettlement,
  RecipientNotifyPreference,
  StorefrontOrder,
  StorefrontOrderDelivery,
  StorefrontOrderItem,
  StorefrontPaidAddon,
} from "@/types/storefront";
import { guestOrderDisplayName } from "@/workspaces/owner/orders/labels";

export type MessageType =
  | "crew"
  | "customer_ready"
  | "customer_delivery_ready"
  | "customer_out_for_delivery"
  | "customer_thank_you";

export type OutForDeliveryAudience = "orderer" | "recipient";

export type DeliveryCustomerReadyVariant = "schedule" | "contact_recipient";

/** Preview 3B Option C — Delivery Crew notify footers (internal; not Confirmation copy). */
export const CREW_NOTIFY_DO_NOT_INFORM =
  "*DO NOT INFORM RECIPIENT (It's A Surprise!)";
export const CREW_NOTIFY_INFORM = "*Inform Recipient before delivery";

/** Product-approved Thank You body — do not alter. */
export const CUSTOMER_THANK_YOU_MESSAGE =
  "Thank you for the order and hope you enjoy ya ;)\n\n" +
  "If there’s anything please do not hesitate to let us know so we can improve and serve you better !\n\n" +
  "Thank you once again and have a nice day ahead!";

/** Product-approved Out for Delivery body — do not alter. */
export const CUSTOMER_OUT_FOR_DELIVERY_MESSAGE =
  "Rider has picked up the order and is on his way ya!";

/**
 * Crew "Time:" — always structured pickupTime (compact Whitebird clock).
 * pickupInstruction is ignored for Crew Time (legacy "Before 3pm" retired).
 */
export function formatCrewPickupTime(input: {
  pickupTime: string;
  /** Ignored — retained for call-site compatibility only. */
  pickupInstruction?: string | null;
}): string {
  const normalized = normalizePickupTimeValue(input.pickupTime);
  const match = /^(\d{2}):(\d{2})$/.exec(normalized);
  if (!match) return input.pickupTime.trim();

  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  if (minutes === "00") return `${hour12}${suffix}`;
  return `${hour12}:${minutes}${suffix}`;
}

export function formatCrewCakeLine(input: {
  cakeName: string;
  sizeLabel: string;
  quantity: number;
}): string {
  const name = input.cakeName.trim() || "Cake";
  const size = input.sizeLabel.trim() || "Size";
  const qty = Math.max(1, Number(input.quantity) || 1);
  return `~ ${name} ${size}x${qty}`;
}

/** Paid-add-on commercial line for Crew (space before x — not size-attached). */
export function formatCrewPaidAddonLine(input: {
  name: string;
  quantity: number;
}): string {
  const name = input.name.trim() || "Add-on";
  const qty = Math.max(1, Number(input.quantity) || 1);
  return `~ ${name} x${qty}`;
}

/**
 * Compact Crew per-card message lines under one commercial add-on line.
 * qty 1 → "Message: …"; qty >1 → "Card N: …". Blank slots omitted.
 */
export function formatCrewPaidAddonMessageLines(input: {
  quantity: number;
  writtenMessage?: string | null;
  messages?: Array<{
    cardIndex: number;
    writtenMessage: string | null;
  }> | null;
}): string[] {
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));
  const slots = messagesForQuantity(
    input.messages ?? undefined,
    quantity,
    input.writtenMessage,
  );
  const lines: string[] = [];
  for (let i = 0; i < quantity; i += 1) {
    const message = normalizeWrittenMessage(slots[i]);
    if (!message) continue;
    if (quantity <= 1) {
      lines.push(`Message: ${message}`);
    } else {
      lines.push(`Card ${i + 1}: ${message}`);
    }
  }
  return lines;
}

/**
 * Full Crew Add-ons; block (heading + lines + messages), or null when empty.
 * Omitted entirely when there are no paid add-ons.
 */
export function formatCrewAddonsBlock(
  paidAddons: StorefrontPaidAddon[] | null | undefined,
): string | null {
  const addons = [...normalizePaidAddonLines(paidAddons)].sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      String(a.code ?? "").localeCompare(String(b.code ?? ""), "en"),
  );
  if (addons.length === 0) return null;

  const bodyLines: string[] = [];
  for (const addon of addons) {
    bodyLines.push(
      formatCrewPaidAddonLine({
        name: addon.name,
        quantity: addon.quantity,
      }),
    );
    bodyLines.push(
      ...formatCrewPaidAddonMessageLines({
        quantity: addon.quantity,
        writtenMessage: addon.writtenMessage,
        messages: addon.messages,
      }),
    );
  }

  return ["Add-ons;", ...bodyLines].join("\n");
}

function formatPaymentDateShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // Malaysia/Singapore calendar day for Whitebird D/M style
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  if (!day || !month) return iso;
  return `${Number(day)}/${Number(month)}`;
}

function formatVerifiedPaymentMethodDate(
  allocation: Pick<
    OrderPaymentAllocationView,
    "method" | "methodDescription" | "paidAt"
  >,
): string {
  const method = paymentMethodLabel(
    allocation.method,
    allocation.methodDescription,
  );
  return `${method} ${formatPaymentDateShort(allocation.paidAt)}`;
}

/** Method + date only — used for a single fully-paid allocation. */
function formatVerifiedPaymentConcise(
  allocation: Pick<
    OrderPaymentAllocationView,
    "method" | "methodDescription" | "paidAt"
  >,
): string {
  return formatVerifiedPaymentMethodDate(allocation);
}

/**
 * Allocation amount + method + date.
 * Used when multiple verified payments exist (fully paid or partial).
 */
function formatVerifiedPaymentWithAmount(
  allocation: Pick<
    OrderPaymentAllocationView,
    "amount" | "method" | "methodDescription" | "paidAt"
  >,
): string {
  return `${formatOrderTotal(allocation.amount)} ${formatVerifiedPaymentMethodDate(allocation)}`;
}

/**
 * Amount line for Crew message.
 * - Amount head from item price snapshots (+ effective adjustments), not collapsed
 *   subtotal alone when an equation is warranted.
 * - Unpaid / partial / fully-paid payment parentheses unchanged.
 */
export function formatCrewPaymentLine(input: {
  settlement: OrderSettlement;
  adjustments: OrderAdjustment[];
  allocations: OrderPaymentAllocationView[];
  pickupDate: string;
  items: Array<Pick<StorefrontOrderItem, "unitPrice" | "quantity">>;
  paidAddons?: Array<
    Pick<StorefrontPaidAddon, "unitPrice" | "quantity" | "financialShorthand">
  > | null;
}): string {
  const { settlement, pickupDate } = input;
  const verified = input.allocations.filter(
    (row) => row.paymentStatus === "verified",
  );
  const effective = getEffectiveAdjustments(input.adjustments);
  const amountHead = formatCrewAmountHead({
    items: commercialEquationItems({
      cakes: input.items,
      paidAddons: normalizePaidAddonLines(input.paidAddons),
    }),
    effective,
    amountDue: settlement.amountDue,
  });
  const coDate = formatPickupDateShort(pickupDate);

  if (settlement.remainingBalance > 0 && verified.length === 0) {
    return `${amountHead} (NYP)`;
  }

  if (settlement.remainingBalance > 0 && verified.length > 0) {
    const paidParts = verified
      .map((row) => formatVerifiedPaymentWithAmount(row))
      .join("; ");
    return `${amountHead} (${paidParts}; ${formatOrderTotal(settlement.remainingBalance)} NYP)`;
  }

  // Fully paid
  if (verified.length === 0) {
    // Edge: marked paid with no allocation rows — still no NYP if balance 0
    return `${amountHead} (c/o ${coDate})`;
  }

  if (verified.length === 1) {
    return `${amountHead} (${formatVerifiedPaymentConcise(verified[0]!)}, c/o ${coDate})`;
  }

  const paymentParts = verified
    .map((row) => formatVerifiedPaymentWithAmount(row))
    .join("; ");
  return `${amountHead} (${paymentParts}, c/o ${coDate})`;
}

/** One item: RM125 or RM165*2 (qty > 1). */
export function formatCrewItemPriceComponent(input: {
  unitPrice: number;
  quantity: number;
}): string {
  return formatItemPriceComponent(input);
}

/**
 * Left-side financial composition from item snapshots + effective adjustments.
 * Simple single ×1 with no adjustments → RMamountDue only (no redundant equation).
 * Shared calculator with Customer Confirmation; Crew uses pf/df shorthands.
 */
export function formatCrewAmountHead(input: {
  items: FinancialEquationItem[];
  effective: Array<
    Pick<OrderAdjustment, "amount" | "label" | "code" | "metadata">
  >;
  amountDue: number;
}): string {
  return formatOrderFinancialEquation({ ...input, audience: "crew" });
}

export function formatCrewDeliveryOrderHeader(input: {
  pickupDate: string;
  unpaid: boolean;
}): string {
  const prefix = input.unpaid ? "🔺🟢🚗" : "🟢🚗";
  const dateShort = formatPickupDateShort(input.pickupDate);
  const weekday = formatPickupWeekdayShort(input.pickupDate);
  return `${prefix} Delivery Order: ${dateShort} (${weekday})`;
}

/** Internal Crew address — includes city/state (not Confirmation’s KK/Sabah omission). */
export function formatCrewDeliveryAddress(
  delivery: StorefrontOrderDelivery,
): string {
  const line1 = delivery.addressLine1.trim();
  const line2 = delivery.addressLine2?.trim() ?? "";
  const locality =
    `${delivery.postcode.trim()} ${delivery.city.trim()}`.trim();
  const state = delivery.state.trim();
  return [line1, line2, locality, state].filter((part) => part.length > 0).join(
    ", ",
  );
}

export function formatCrewRecipientNotifyFooter(
  preference: RecipientNotifyPreference | null | undefined,
): string | null {
  if (preference === "do_not_inform_recipient") {
    return CREW_NOTIFY_DO_NOT_INFORM;
  }
  if (preference === "inform_recipient") {
    return CREW_NOTIFY_INFORM;
  }
  return null;
}

function crewDisplayName(order: StorefrontOrder): string {
  return guestOrderDisplayName({
    customerName: order.customerName,
    orderSource: order.orderSource,
    crewOrder: order.crewOrder,
  });
}

function crewTimeLabel(order: StorefrontOrder): string {
  return formatCrewPickupTime({
    pickupTime: order.pickupTime,
    pickupInstruction: order.pickupInstruction,
  });
}

function formatCrewDeliveryIdentityLines(order: StorefrontOrder): string[] {
  const displayName = crewDisplayName(order);
  const phone = order.phone.trim();
  const time = crewTimeLabel(order);
  const delivery = order.delivery ?? null;

  if (!delivery) {
    return [`Ordered by: ${displayName}`, `Phone No: ${phone}`, `Time: ${time}`];
  }

  const samePerson = isDeliveryRecipientSameAsOrderingCustomer({
    customerName: order.customerName,
    customerPhone: order.phone,
    delivery,
  });
  const address = formatCrewDeliveryAddress(delivery);

  if (samePerson) {
    return [
      `Ordered by/ Recipient: ${displayName}`,
      `Phone No: ${phone}`,
      `Address: ${address}`,
      `Time: ${time}`,
    ];
  }

  return [
    `Ordered by: ${displayName}`,
    `Phone No: ${phone}`,
    `Recipient: ${delivery.recipientName.trim()}`,
    `Recipient Phone No: ${delivery.recipientPhone.trim()}`,
    `Address: ${address}`,
    `Time: ${time}`,
  ];
}

function appendCrewCommercialSettlementAndFooters(
  order: StorefrontOrder,
  lines: string[],
  notifyFooter?: string | null,
): void {
  const cakeLines = order.items
    .map((item) =>
      formatCrewCakeLine({
        cakeName: item.cakeName,
        sizeLabel: item.sizeLabel,
        quantity: item.quantity,
      }),
    )
    .join("\n");

  const addonsBlock = formatCrewAddonsBlock(order.paidAddons);
  const paymentLine = formatCrewPaymentLine({
    settlement: order.settlement,
    adjustments: order.adjustments,
    allocations: order.paymentAllocations,
    pickupDate: order.pickupDate,
    items: order.items,
    paidAddons: normalizePaidAddonLines(order.paidAddons),
  });
  const complimentary = formatComplimentaryLine(
    [...order.complimentaryItems]
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "en"),
      )
      .map((item) => ({
        name: item.name,
        quantity: item.quantity,
      })),
  );

  lines.push("Whole Cake;");
  lines.push(cakeLines);
  if (addonsBlock) {
    lines.push("");
    lines.push(addonsBlock);
  }
  lines.push("");
  lines.push(paymentLine);
  if (order.fulfilmentMethod === "delivery") {
    const waivers = formatDeliveryFinanceWaiverLines({
      fulfilmentMethod: order.fulfilmentMethod,
      delivery: order.delivery,
    });
    if (waivers) {
      lines.push(waivers);
    }
  }
  if (complimentary) {
    lines.push("");
    lines.push(`*Complimentary ${complimentary}`);
  }
  if (order.includeReceipt) {
    lines.push("*Include RECEIPT");
  }
  if (notifyFooter) {
    lines.push(notifyFooter);
  }
}

function generateDineInCrewOrderMessage(order: StorefrontOrder): string {
  const unpaid = order.settlement.remainingBalance > 0;
  const headerPrefix = unpaid ? "🔺🟢🍽️" : "🟢🍽️";
  const dateShort = formatPickupDateShort(order.pickupDate);
  const weekday = formatPickupWeekdayShort(order.pickupDate);
  const reservation = order.dineInReservation;
  const lines: string[] = [
    `${headerPrefix} Dine-In order: ${dateShort} (${weekday})`,
    "",
    `Ordered by: ${crewDisplayName(order)}`,
    `Phone No: ${order.phone.trim()}`,
    `Cake serving time: ${crewTimeLabel(order)}`,
    "",
  ];
  appendCrewCommercialSettlementAndFooters(order, lines);
  if (reservation) {
    const venue = dineInVenueLabel(reservation.venue);
    const reservationTime = formatPickupTime(reservation.reservationTime);
    lines.push("");
    lines.push(
      `* Dine-in reservation: ${reservationTime} @ ${venue}`,
    );
    lines.push(`* Guests: ${reservation.guestCount}`);
    if (reservation.reservationNote?.trim()) {
      lines.push(`* ${reservation.reservationNote.trim()}`);
    }
    lines.push(`* Reservation status: ${reservation.status}`);
  }
  return lines.join("\n");
}

function generatePickupCrewOrderMessage(order: StorefrontOrder): string {
  const unpaid = order.settlement.remainingBalance > 0;
  const headerPrefix = unpaid ? "🔺🟢" : "🟢";
  const dateShort = formatPickupDateShort(order.pickupDate);
  const weekday = formatPickupWeekdayShort(order.pickupDate);
  const lines: string[] = [
    `${headerPrefix}Pick-up order: ${dateShort} (${weekday})`,
    "",
    `Ordered by: ${crewDisplayName(order)}`,
    `Phone No: ${order.phone.trim()}`,
    `Time: ${crewTimeLabel(order)}`,
    "",
  ];
  appendCrewCommercialSettlementAndFooters(order, lines);
  return lines.join("\n");
}

function generateDeliveryCrewOrderMessage(order: StorefrontOrder): string {
  const unpaid = order.settlement.remainingBalance > 0;
  const delivery = order.delivery ?? null;
  const samePerson = isDeliveryRecipientSameAsOrderingCustomer({
    customerName: order.customerName,
    customerPhone: order.phone,
    delivery,
  });
  const notifyFooter =
    delivery && !samePerson
      ? formatCrewRecipientNotifyFooter(delivery.recipientNotifyPreference)
      : null;

  const lines: string[] = [
    formatCrewDeliveryOrderHeader({
      pickupDate: order.pickupDate,
      unpaid,
    }),
    "",
    ...formatCrewDeliveryIdentityLines(order),
    "",
  ];
  appendCrewCommercialSettlementAndFooters(order, lines, notifyFooter);
  return lines.join("\n");
}

export function generateCrewOrderMessage(order: StorefrontOrder): string {
  if (order.fulfilmentMethod === "delivery") {
    return generateDeliveryCrewOrderMessage(order);
  }
  if (order.fulfilmentMethod === "dine_in") {
    return generateDineInCrewOrderMessage(order);
  }
  return generatePickupCrewOrderMessage(order);
}

export function generateCustomerReadyMessage(senderName: string): string {
  const sender = senderName.trim() || "Whitebird";
  return (
    `Good morning, ${sender} here ☀️\n` +
    `Just to let you know that your order is ready for pick up ✨\n` +
    `Kindly mention the Order Name and Cake Flavour at the Whitebird counter ya 😉\n\n` +
    `If you would like to arrange GrabExpress, we recommend placing the booking before 3:00pm to avoid difficulty getting a driver and possible traffic delays.\n\n` +
    `💛 We can also help bring the cake down if needed. Just send us your driver’s:\n` +
    `🚗 Car Plate Number: __________ (when you have arrived) __________\n\n` +
    `A gentle reminder that last pickup will be as follow.\n` +
    `Mon, Tue & Thurs :5:30pm\n` +
    `Wed :3:00pm\n` +
    `Fri-Sun :9:30pm\n\n` +
    `Thank you, and hope to see you soon! 🤭`
  );
}

export function deliveryCustomerReadyVariant(
  order: Pick<StorefrontOrder, "customerName" | "phone" | "fulfilmentMethod" | "delivery">,
): DeliveryCustomerReadyVariant {
  const delivery = order.delivery;
  if (!delivery || order.fulfilmentMethod !== "delivery") {
    return "schedule";
  }
  const samePerson = isDeliveryRecipientSameAsOrderingCustomer({
    customerName: order.customerName,
    customerPhone: order.phone,
    delivery,
  });
  if (samePerson) return "schedule";
  if (delivery.recipientNotifyPreference === "inform_recipient") {
    return "contact_recipient";
  }
  return "schedule";
}

export function generateCustomerDeliveryReadyMessage(input: {
  senderName: string;
  scheduledTime: string;
  variant: DeliveryCustomerReadyVariant;
}): string {
  const sender = input.senderName.trim() || "Whitebird";
  if (input.variant === "contact_recipient") {
    return (
      `Good morning, ${sender} here.\n` +
      `Just to inform you that your order is ready for delivery anytime now.\n` +
      `We will contact the recipient for arranging the delivery ya ;)`
    );
  }
  const time = formatCrewPickupTime({ pickupTime: input.scheduledTime });
  return (
    `Good morning, ${sender} here.\n` +
    `Just to inform you that your order is ready for delivery anytime now, we will arrange delivery base on your schedule at ${time}.\n` +
    `Do let us know if you like to deliver earlier ya ;)`
  );
}

export function outForDeliveryMessageAudiences(
  order: Pick<StorefrontOrder, "customerName" | "phone" | "fulfilmentMethod" | "delivery">,
): OutForDeliveryAudience[] {
  const delivery = order.delivery;
  if (!delivery || order.fulfilmentMethod !== "delivery") {
    return ["orderer"];
  }
  const samePerson = isDeliveryRecipientSameAsOrderingCustomer({
    customerName: order.customerName,
    customerPhone: order.phone,
    delivery,
  });
  if (samePerson) return ["orderer"];
  if (delivery.recipientNotifyPreference === "inform_recipient") {
    return ["orderer", "recipient"];
  }
  return ["orderer"];
}

export function outForDeliveryContactForAudience(
  order: Pick<StorefrontOrder, "customerName" | "phone" | "delivery">,
  audience: OutForDeliveryAudience,
): { name: string; phone: string } {
  if (audience === "recipient" && order.delivery) {
    return {
      name: order.delivery.recipientName.trim(),
      phone: order.delivery.recipientPhone.trim(),
    };
  }
  return {
    name: order.customerName.trim(),
    phone: order.phone.trim(),
  };
}

export function generateCustomerOutForDeliveryMessage(): string {
  return CUSTOMER_OUT_FOR_DELIVERY_MESSAGE;
}

export function generateCustomerThankYouMessage(): string {
  return CUSTOMER_THANK_YOU_MESSAGE;
}

export function generateOrderMessage(
  type: MessageType,
  input: { order: StorefrontOrder; senderName?: string },
): string {
  switch (type) {
    case "crew":
      return generateCrewOrderMessage(input.order);
    case "customer_ready":
      if (input.order.fulfilmentMethod === "delivery") {
        throw new Error(
          "Pickup Customer Ready Message is not used for Delivery.",
        );
      }
      return generateCustomerReadyMessage(input.senderName ?? "");
    case "customer_delivery_ready":
      if (input.order.fulfilmentMethod !== "delivery") {
        throw new Error("Delivery Customer Ready is only for Delivery orders.");
      }
      return generateCustomerDeliveryReadyMessage({
        senderName: input.senderName ?? "",
        scheduledTime: input.order.pickupTime,
        variant: deliveryCustomerReadyVariant(input.order),
      });
    case "customer_out_for_delivery":
      return generateCustomerOutForDeliveryMessage();
    case "customer_thank_you":
      return generateCustomerThankYouMessage();
  }
}
