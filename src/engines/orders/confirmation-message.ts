import { formatPickupTime } from "@/workspaces/owner/orders/labels";
import { formatOrderFinancialEquation } from "@/engines/orders/financial-equation";
import { getEffectiveAdjustments } from "@/engines/orders/promotions";
import type {
  ConfirmationPayload,
  OrderAdjustment,
  StorefrontOrder,
} from "@/types/storefront";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

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

/**
 * Customer-facing financial block for confirmation.
 * Full item + adjustment equation (shared with Crew amount head).
 * No payment / NYP / c/o notation.
 */
export function formatConfirmationFinancialBlock(
  payload: Pick<
    ConfirmationPayload,
    "items" | "subtotal" | "amountDue" | "adjustments" | "total"
  >,
): string {
  const amountDue = payload.amountDue ?? payload.total;
  const adjustments = payload.adjustments ?? [];
  return formatOrderFinancialEquation({
    items: payload.items,
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

  const cakeLines = payload.items
    .map(
      (item) =>
        `~ ${item.cakeName} ${item.sizeLabel} x${item.quantity}`,
    )
    .join("\n");

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
    `${cakeLines}\n\n` +
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
  /** Item subtotal (price snapshots). */
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
