import {
  dineInVenueLabel,
  parseDineInVenue,
} from "@/engines/business-calendar/dine-in-hours";
import { formatPickupClockLabel } from "@/engines/business-calendar/pickup-schedule";
import {
  recipientNotifyPreferenceLabel,
  workspaceFulfilmentSectionTitle,
} from "@/engines/orders/fulfilment";
import { calculateCommercialSubtotal } from "@/engines/orders/totals";
import { formatDateTime } from "@/lib/dates";
import type { RecipientNotifyPreference } from "@/types/storefront";
import type { WaitingListConfirmationLinkStatus } from "@/engines/waiting-list/confirmation-link";
import type { WaitingListItemStatus } from "@/engines/waiting-list/types";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";

export const WAITING_LIST_CONFIRMATION_GENERATE_LABEL =
  "Generate Confirmation Link";
export const WAITING_LIST_CONFIRMATION_CONVERT_LABEL = "Convert to Order";
export const WAITING_LIST_CONFIRMATION_ISSUED_LABEL = "Confirmation link sent";
export const WAITING_LIST_CONFIRMATION_SUBMITTED_LABEL =
  "Customer details received";
export const WAITING_LIST_CONFIRMATION_CONVERTED_LABEL = "Converted to Order";
export const WAITING_LIST_CONFIRMATION_EXPIRED_LABEL =
  "Confirmation link expired";
export const WAITING_LIST_CONFIRMATION_INVALIDATED_LABEL =
  "Confirmation link invalidated";

export type WaitingListConfirmationDisplayItem = {
  cakeName: string;
  sizeLabel: string;
  quantity: number;
  unitPrice: number;
};

export type WaitingListConfirmationPaidAddonCatalog = {
  code: string;
  name: string;
  unitPrice: number;
};

export type WaitingListConfirmationRequestItem = {
  itemId: string;
  cakeName: string;
  sizeLabel: string;
  quantity: number;
  status?: WaitingListItemStatus | string | null;
  offeredQuantity?: number | null;
};

export type WaitingListConfirmationReviewDelivery = {
  recipientName: string;
  recipientPhone: string;
  addressLine1: string;
  addressLine2: string | null;
  postcode: string;
  city: string;
  state: string;
  notifyPreference: string | null;
};

export type WaitingListConfirmationReviewDineIn = {
  venue: string;
  reservationTime: string;
  servingTime: string;
  guestCount: number | null;
  note: string | null;
};

export type WaitingListConfirmationReview = {
  customerName: string;
  customerPhone: string;
  fulfilmentMethod: "pickup" | "delivery" | "dine_in";
  fulfilmentLabel: string;
  pickupDate: string;
  selectedTime: string;
  selectedTimeLabel: string;
  delivery: WaitingListConfirmationReviewDelivery | null;
  dineIn: WaitingListConfirmationReviewDineIn | null;
  complimentary: Array<{ name: string; quantity: number }>;
  paidAddons: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    messages: string[];
  }>;
  customerNote: string | null;
  includeReceipt: boolean | null;
  items: WaitingListConfirmationDisplayItem[];
  reviewTotal: number;
  reviewTotalLabel: string;
};

export type WaitingListConfirmationStaffLink = {
  id: string;
  requestId: string;
  status: WaitingListConfirmationLinkStatus;
  expiresAt: string;
  issuedAt: string;
  submittedAt: string | null;
  convertedOrderId: string | null;
  convertedOrderNumber: string | null;
  items: WaitingListConfirmationDisplayItem[];
  review: WaitingListConfirmationReview | null;
};

export function waitingListConvertedOrderHref(orderId: string): string {
  return `/bakery/orders/${orderId}`;
}

export function canConvertWaitingListConfirmation(
  link: WaitingListConfirmationStaffLink | null | undefined,
): boolean {
  return Boolean(
    link &&
      link.status === "submitted" &&
      link.review &&
      !link.convertedOrderId,
  );
}

const WAITING_LIST_CONVERT_SAFE_ERRORS = [
  "Waiting-list request is required",
  "Waiting-list request not found",
  "Confirmation link not found",
  "This confirmation link has expired",
  "This confirmation link has been invalidated",
  "This confirmation has not been submitted",
  "Customer details are missing",
  "This confirmation has already been converted",
  "This waiting-list request is no longer convertible",
  "This confirmation no longer matches the waiting-list items",
  "Offered quantity is no longer available",
  "Hold no longer valid",
  "Invalid fulfilment data",
  "Not authorized to manage the waiting list",
] as const;

export const WAITING_LIST_CONVERT_GENERIC_ERROR =
  "Could not convert this confirmation to an order.";

export function waitingListConvertConfirmationError(
  message: string | null | undefined,
): string {
  const text = String(message ?? "").trim();
  if (!text) return WAITING_LIST_CONVERT_GENERIC_ERROR;
  const known = WAITING_LIST_CONVERT_SAFE_ERRORS.find((entry) =>
    text.includes(entry),
  );
  if (known) return known;
  if (
    /cake is not available/i.test(text) ||
    /cake size is not available/i.test(text) ||
    /paid add-on/i.test(text) ||
    /complimentary/i.test(text) ||
    /catalogue/i.test(text) ||
    /library/i.test(text)
  ) {
    return "Pricing or catalogue details no longer match.";
  }
  return WAITING_LIST_CONVERT_GENERIC_ERROR;
}

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function waitingListConfirmationLinkStatusLabel(
  status: WaitingListConfirmationLinkStatus | string,
): string {
  if (status === "converted") return WAITING_LIST_CONFIRMATION_CONVERTED_LABEL;
  if (status === "submitted") return WAITING_LIST_CONFIRMATION_SUBMITTED_LABEL;
  if (status === "expired") return WAITING_LIST_CONFIRMATION_EXPIRED_LABEL;
  if (status === "invalidated")
    return WAITING_LIST_CONFIRMATION_INVALIDATED_LABEL;
  return WAITING_LIST_CONFIRMATION_ISSUED_LABEL;
}

export function waitingListConfirmationDeadlineLabel(
  expiresAt: Date | string,
): string {
  return `Confirmation deadline: ${formatDateTime(expiresAt)}`;
}

export function eligibleWaitingListConfirmationItems(
  items: readonly WaitingListConfirmationRequestItem[],
): WaitingListConfirmationDisplayItem[] {
  return items.flatMap((item) => {
    const offered = Number(item.offeredQuantity ?? 0);
    if (item.status !== "contacted") return [];
    if (!Number.isFinite(offered) || offered < 1) return [];
    return [
      {
        cakeName: item.cakeName,
        sizeLabel: item.sizeLabel,
        quantity: Math.floor(offered),
        unitPrice: 0,
      },
    ];
  });
}

export function waitingListConfirmationExcludedItems(
  items: readonly WaitingListConfirmationRequestItem[],
): WaitingListConfirmationRequestItem[] {
  return items.filter((item) => {
    const offered = Number(item.offeredQuantity ?? 0);
    return (
      item.status !== "contacted" || !Number.isFinite(offered) || offered < 1
    );
  });
}

export function parseWaitingListConfirmationDisplayItems(
  value: unknown,
): WaitingListConfirmationDisplayItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const entry = asRecord(row);
    if (!entry) return [];
    const cakeName = asTrimmed(entry.cake_name ?? entry.cakeName);
    const sizeLabel = asTrimmed(entry.size_label ?? entry.sizeLabel);
    const quantity = Number(entry.quantity ?? entry.offered_quantity ?? 0);
    const unitPrice = Number(entry.unit_price ?? entry.unitPrice ?? 0);
    if (!cakeName || !sizeLabel || !Number.isFinite(quantity) || quantity < 1) {
      return [];
    }
    return [
      {
        cakeName,
        sizeLabel,
        quantity: Math.floor(quantity),
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      },
    ];
  });
}

function paidAddonName(
  code: string,
  catalog: ReadonlyMap<string, WaitingListConfirmationPaidAddonCatalog>,
): string {
  const named = catalog.get(code)?.name.trim();
  if (named) return named;
  if (code === "birthday_card") return "Birthday card";
  if (code === "wishing_card") return "Wishing card";
  return code.replaceAll("_", " ");
}

function parseMessages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      return trimmed ? [trimmed] : [];
    }
    const record = asRecord(entry);
    const written = asTrimmed(
      record?.writtenMessage ?? record?.written_message ?? record?.message,
    );
    return written ? [written] : [];
  });
}

function parseFulfilmentMethod(
  value: unknown,
): "pickup" | "delivery" | "dine_in" {
  const raw = asTrimmed(value);
  if (raw === "delivery" || raw === "dine_in") return raw;
  return "pickup";
}

export function parseWaitingListConfirmationReview(input: {
  payload: unknown;
  items: readonly WaitingListConfirmationDisplayItem[];
  paidAddonCatalog?: readonly WaitingListConfirmationPaidAddonCatalog[];
}): WaitingListConfirmationReview | null {
  const payload = asRecord(input.payload);
  if (!payload) return null;

  const items = input.items.filter((item) => item.quantity >= 1);
  if (items.length === 0) return null;

  const catalog = new Map(
    (input.paidAddonCatalog ?? []).map((option) => [option.code, option]),
  );
  const method = parseFulfilmentMethod(payload.fulfilment_method);
  const selectedTime = asTrimmed(payload.pickup_time);
  const deliveryRaw = asRecord(payload.delivery);
  const dineInRaw = asRecord(payload.dine_in);

  const complimentary = Array.isArray(payload.complimentary)
    ? payload.complimentary.flatMap((row) => {
        const entry = asRecord(row);
        if (!entry) return [];
        const name = asTrimmed(entry.name);
        const quantity = Number(entry.quantity ?? 1);
        if (!name || !Number.isFinite(quantity) || quantity < 1) return [];
        return [{ name, quantity: Math.floor(quantity) }];
      })
    : [];

  const paidAddons = Array.isArray(payload.paid_addons)
    ? payload.paid_addons.flatMap((row) => {
        const entry = asRecord(row);
        if (!entry) return [];
        const code = asTrimmed(entry.code);
        const quantity = Number(entry.quantity ?? 1);
        if (!code || !Number.isFinite(quantity) || quantity < 1) return [];
        const unitPrice = catalog.get(code)?.unitPrice ?? 0;
        return [
          {
            name: paidAddonName(code, catalog),
            quantity: Math.floor(quantity),
            unitPrice,
            messages: parseMessages(entry.messages),
          },
        ];
      })
    : [];

  const reviewTotal = calculateCommercialSubtotal({
    items,
    paidAddons: paidAddons.map((addon) => ({
      unitPrice: addon.unitPrice,
      quantity: addon.quantity,
    })),
  });

  const venue = parseDineInVenue(dineInRaw?.venue);
  const reservationTime = asTrimmed(dineInRaw?.reservation_time);
  const guestCountRaw = Number(dineInRaw?.guest_count ?? 0);

  return {
    customerName: asTrimmed(payload.customer_name),
    customerPhone: asTrimmed(payload.phone),
    fulfilmentMethod: method,
    fulfilmentLabel: workspaceFulfilmentSectionTitle(method),
    pickupDate: asTrimmed(payload.pickup_date),
    selectedTime,
    selectedTimeLabel: selectedTime ? formatPickupClockLabel(selectedTime) : "",
    delivery:
      method === "delivery" && deliveryRaw
        ? {
            recipientName: asTrimmed(deliveryRaw.recipient_name),
            recipientPhone: asTrimmed(deliveryRaw.recipient_phone),
            addressLine1: asTrimmed(deliveryRaw.address_line_1),
            addressLine2: asTrimmed(deliveryRaw.address_line_2) || null,
            postcode: asTrimmed(deliveryRaw.postcode),
            city: asTrimmed(deliveryRaw.city),
            state: asTrimmed(deliveryRaw.state),
            notifyPreference: recipientNotifyPreferenceLabel(
              asTrimmed(
                deliveryRaw.recipient_notify_preference,
              ) as RecipientNotifyPreference,
            ),
          }
        : null,
    dineIn:
      method === "dine_in"
        ? {
            venue: venue
              ? dineInVenueLabel(venue)
              : asTrimmed(dineInRaw?.venue),
            reservationTime: reservationTime
              ? formatPickupClockLabel(reservationTime)
              : "",
            servingTime: selectedTime
              ? formatPickupClockLabel(selectedTime)
              : "",
            guestCount:
              Number.isFinite(guestCountRaw) && guestCountRaw > 0
                ? Math.floor(guestCountRaw)
                : null,
            note: asTrimmed(dineInRaw?.reservation_note) || null,
          }
        : null,
    complimentary,
    paidAddons,
    customerNote: asTrimmed(payload.notes) || null,
    includeReceipt:
      typeof payload.include_receipt === "boolean"
        ? payload.include_receipt
        : null,
    items: [...items],
    reviewTotal,
    reviewTotalLabel: formatRm(reviewTotal),
  };
}

export function formatWaitingListConfirmationReviewCopy(
  review: WaitingListConfirmationReview,
): string {
  const lines = [
    "CUSTOMER",
    review.customerName,
    review.customerPhone,
    "",
    "FULFILMENT",
    review.fulfilmentLabel,
    review.pickupDate,
    review.selectedTimeLabel || review.selectedTime,
  ];
  if (review.delivery) {
    lines.push(
      "",
      "DELIVERY",
      review.delivery.recipientName,
      review.delivery.recipientPhone,
      review.delivery.addressLine1,
      review.delivery.addressLine2 ?? "",
      review.delivery.postcode,
      `${review.delivery.city} ${review.delivery.state}`.trim(),
      review.delivery.notifyPreference ?? "",
    );
  }
  if (review.dineIn) {
    lines.push(
      "",
      "DINE-IN",
      review.dineIn.venue,
      review.dineIn.reservationTime,
      review.dineIn.servingTime,
      review.dineIn.guestCount != null ? String(review.dineIn.guestCount) : "",
      review.dineIn.note ?? "",
    );
  }
  if (review.complimentary.length > 0 || review.paidAddons.length > 0) {
    lines.push("", "OPTIONS");
    for (const item of review.complimentary) {
      lines.push(`${item.name} × ${item.quantity}`);
    }
    for (const addon of review.paidAddons) {
      lines.push(`${addon.name} × ${addon.quantity}`);
      for (const message of addon.messages) {
        lines.push(`  ${message}`);
      }
    }
  }
  if (review.customerNote || review.includeReceipt != null) {
    lines.push("", "NOTES");
    if (review.customerNote) lines.push(review.customerNote);
    if (review.includeReceipt != null) {
      lines.push(
        review.includeReceipt ? "Receipt copy requested" : "No receipt copy",
      );
    }
  }
  lines.push("", "ITEMS");
  for (const item of review.items) {
    lines.push(
      `${item.cakeName} · ${item.sizeLabel} × ${item.quantity} · ${formatRm(item.unitPrice * item.quantity)}`,
    );
  }
  lines.push("", `Total ${review.reviewTotalLabel}`);
  return lines
    .filter((line) => line !== undefined)
    .join("\n")
    .trim();
}

export function parseStaffWaitingListConfirmationLinks(
  value: unknown,
  paidAddonCatalog: readonly WaitingListConfirmationPaidAddonCatalog[] = [],
): WaitingListConfirmationStaffLink[] {
  let rows = value;
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const entry = asRecord(row);
    if (!entry) return [];
    const id = asTrimmed(entry.id);
    const requestId = asTrimmed(entry.request_id ?? entry.requestId);
    const status = asTrimmed(entry.status) as WaitingListConfirmationLinkStatus;
    const expiresAt = asTrimmed(entry.expires_at ?? entry.expiresAt);
    if (!id || !requestId || !expiresAt) return [];
    if (
      status !== "issued" &&
      status !== "submitted" &&
      status !== "expired" &&
      status !== "invalidated" &&
      status !== "converted"
    ) {
      return [];
    }
    const items = parseWaitingListConfirmationDisplayItems(entry.items);
    const convertedOrderId =
      asTrimmed(entry.converted_order_id ?? entry.convertedOrderId) || null;
    const convertedOrderNumber =
      asTrimmed(entry.converted_order_number ?? entry.convertedOrderNumber) ||
      null;
    const review =
      status === "submitted" || status === "converted"
        ? parseWaitingListConfirmationReview({
            payload: entry.submitted_payload ?? entry.submittedPayload,
            items,
            paidAddonCatalog,
          })
        : null;
    return [
      {
        id,
        requestId,
        status,
        expiresAt,
        issuedAt: asTrimmed(entry.issued_at ?? entry.issuedAt),
        submittedAt: asTrimmed(entry.submitted_at ?? entry.submittedAt) || null,
        convertedOrderId,
        convertedOrderNumber,
        items,
        review,
      },
    ];
  });
}
