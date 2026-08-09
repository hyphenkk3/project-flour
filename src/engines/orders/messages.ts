import {
  formatPickupDateShort,
  formatPickupWeekdayShort,
  formatComplimentaryLine,
} from "@/engines/orders/confirmation-message";
import {
  formatItemPriceComponent,
  formatOrderFinancialEquation,
} from "@/engines/orders/financial-equation";
import { paymentMethodLabel } from "@/engines/orders/payment-details";
import { getEffectiveAdjustments } from "@/engines/orders/promotions";
import { formatOrderTotal } from "@/engines/orders/totals";
import { normalizePickupTimeValue } from "@/engines/business-calendar/pickup-slots";
import type {
  OrderAdjustment,
  OrderPaymentAllocationView,
  OrderSettlement,
  StorefrontOrder,
  StorefrontOrderItem,
} from "@/types/storefront";
import { guestOrderDisplayName } from "@/workspaces/owner/orders/labels";

export type MessageType = "crew" | "customer_ready" | "customer_thank_you";

/** Product-approved Thank You body — do not alter. */
export const CUSTOMER_THANK_YOU_MESSAGE =
  "Thank you for the order and hope you enjoy ya ;)\n\n" +
  "If there’s anything please do not hesitate to let us know so we can improve and serve you better !\n\n" +
  "Thank you once again and have a nice day ahead!";

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
}): string {
  const { settlement, pickupDate } = input;
  const verified = input.allocations.filter(
    (row) => row.paymentStatus === "verified",
  );
  const effective = getEffectiveAdjustments(input.adjustments);
  const amountHead = formatCrewAmountHead({
    items: input.items,
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
 * Shared calculator with Customer Confirmation — do not diverge.
 */
export function formatCrewAmountHead(input: {
  items: Array<Pick<StorefrontOrderItem, "unitPrice" | "quantity">>;
  effective: Array<
    Pick<OrderAdjustment, "amount" | "label" | "code" | "metadata">
  >;
  amountDue: number;
}): string {
  return formatOrderFinancialEquation(input);
}

export function generateCrewOrderMessage(order: StorefrontOrder): string {
  const unpaid = order.settlement.remainingBalance > 0;
  const headerPrefix = unpaid ? "🔺🟢" : "🟢";
  const dateShort = formatPickupDateShort(order.pickupDate);
  const weekday = formatPickupWeekdayShort(order.pickupDate);
  const displayName = guestOrderDisplayName({
    customerName: order.customerName,
    orderSource: order.orderSource,
    crewOrder: order.crewOrder,
  });
  const phone = order.phone.trim();
  const time = formatCrewPickupTime({
    pickupTime: order.pickupTime,
    pickupInstruction: order.pickupInstruction,
  });

  const cakeLines = order.items
    .map((item) =>
      formatCrewCakeLine({
        cakeName: item.cakeName,
        sizeLabel: item.sizeLabel,
        quantity: item.quantity,
      }),
    )
    .join("\n");

  const paymentLine = formatCrewPaymentLine({
    settlement: order.settlement,
    adjustments: order.adjustments,
    allocations: order.paymentAllocations,
    pickupDate: order.pickupDate,
    items: order.items,
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

  const lines: string[] = [
    `${headerPrefix}Pick-up order: ${dateShort} (${weekday})`,
    "",
    `Ordered by: ${displayName}`,
    `Phone No: ${phone}`,
    `Time: ${time}`,
    "",
    "Whole Cake;",
    cakeLines,
    "",
    paymentLine,
  ];

  if (complimentary) {
    lines.push("");
    lines.push(`*Complimentary ${complimentary}`);
  }

  if (order.includeReceipt) {
    lines.push("*Include RECEIPT");
  }

  return lines.join("\n");
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
      return generateCustomerReadyMessage(input.senderName ?? "");
    case "customer_thank_you":
      return generateCustomerThankYouMessage();
  }
}
