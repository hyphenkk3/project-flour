import { formatShortBusinessDate } from "@/lib/dates";
import { formatPickupTime } from "@/workspaces/owner/orders/labels";

export type NewOrderNotificationItem = {
  cakeName: string;
  sizeLabel: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type NewOrderNotificationAddon = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type NewOrderNotificationDelivery = {
  recipientName: string;
  recipientPhone: string;
  addressLine1: string;
  addressLine2: string | null;
  postcode: string;
  city: string;
  state: string;
};

export type NewOrderNotificationDineIn = {
  venue: string | null;
  guestCount: number | null;
  reservationTime: string | null;
};

export type NewOrderNotificationSummary = {
  guestName: string | null;
  guestPhone: string | null;
  orderNumber: string | null;
  pickupDate: string | null;
  pickupTime: string | null;
  fulfilmentMethod: string | null;
  fulfilmentLabel: string;
  notes: string | null;
  items: NewOrderNotificationItem[];
  addons: NewOrderNotificationAddon[];
  total: number;
  delivery: NewOrderNotificationDelivery | null;
  dineIn: NewOrderNotificationDineIn | null;
};

export function fulfilmentLabelForMethod(method: string | null | undefined): string {
  switch (method) {
    case "dine_in":
      return "Dine-in";
    case "delivery":
      return "Delivery";
    case "pickup":
      return "Pickup";
    default:
      return "";
  }
}

export function formatNewOrderRm(amount: number): string {
  if (!Number.isFinite(amount)) return "RM0";
  return `RM${amount % 1 === 0 ? String(amount) : amount.toFixed(2)}`;
}

function normalizeSizeToken(value: string): string {
  return value
    .trim()
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u301D\u301E]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Display cake + size once. Payload still stores both fields. */
export function formatNewOrderCakeDisplay(
  cakeName: string,
  sizeLabel: string,
): string {
  const name = cakeName.trim();
  const size = sizeLabel.trim();
  if (!name) return size;
  if (!size) return name;
  if (normalizeSizeToken(name).includes(normalizeSizeToken(size))) {
    return name;
  }
  return `${name} · ${size}`;
}

export function formatNewOrderItemLine(item: NewOrderNotificationItem): string {
  return `${formatNewOrderCakeDisplay(item.cakeName, item.sizeLabel)} × ${item.quantity} — ${formatNewOrderRm(item.lineTotal)}`;
}

export function compactNewOrderCakeSummary(
  items: NewOrderNotificationItem[],
): string | null {
  const first = items[0];
  if (!first) return null;
  const head = `${formatNewOrderCakeDisplay(first.cakeName, first.sizeLabel)} × ${first.quantity}`;
  const extra = items.length - 1;
  return extra > 0 ? `${head} + ${extra} more` : head;
}

export function buildNewOrderToastDescription(
  summary: NewOrderNotificationSummary,
): string {
  const line1 = [
    summary.guestName?.trim() || null,
    compactNewOrderCakeSummary(summary.items),
    summary.pickupDate?.trim() || null,
    summary.fulfilmentLabel.trim() || null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  const line2 = summary.orderNumber?.trim() || "";
  return [line1, line2].filter(Boolean).join("\n");
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseItems(value: unknown): NewOrderNotificationItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const quantity = asFiniteNumber(record.quantity) ?? 0;
    const unitPrice = asFiniteNumber(record.unitPrice) ?? 0;
    const lineTotal = asFiniteNumber(record.lineTotal) ?? quantity * unitPrice;
    return [
      {
        cakeName: asTrimmedString(record.cakeName) ?? "",
        sizeLabel: asTrimmedString(record.sizeLabel) ?? "",
        quantity,
        unitPrice,
        lineTotal,
      },
    ];
  });
}

function parseAddons(value: unknown): NewOrderNotificationAddon[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const quantity = asFiniteNumber(record.quantity) ?? 0;
    const unitPrice = asFiniteNumber(record.unitPrice) ?? 0;
    const lineTotal = asFiniteNumber(record.lineTotal) ?? quantity * unitPrice;
    const name = asTrimmedString(record.name) ?? "";
    if (!name) return [];
    return [{ name, quantity, unitPrice, lineTotal }];
  });
}

function parseDelivery(value: unknown): NewOrderNotificationDelivery | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const recipientName = asTrimmedString(record.recipientName);
  const addressLine1 = asTrimmedString(record.addressLine1);
  if (!recipientName || !addressLine1) return null;
  return {
    recipientName,
    recipientPhone: asTrimmedString(record.recipientPhone) ?? "",
    addressLine1,
    addressLine2: asTrimmedString(record.addressLine2),
    postcode: asTrimmedString(record.postcode) ?? "",
    city: asTrimmedString(record.city) ?? "",
    state: asTrimmedString(record.state) ?? "",
  };
}

function parseDineIn(value: unknown): NewOrderNotificationDineIn | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    venue: asTrimmedString(record.venue),
    guestCount: asFiniteNumber(record.guestCount),
    reservationTime: asTrimmedString(record.reservationTime),
  };
}

export function parseNewOrderNotificationPayload(
  payload: Record<string, unknown> | null | undefined,
): NewOrderNotificationSummary | null {
  if (!payload) return null;
  const fulfilmentMethod = asTrimmedString(payload.fulfilmentMethod);
  const items = parseItems(payload.items);
  const addons = parseAddons(payload.addons);
  return {
    guestName: asTrimmedString(payload.guestName),
    guestPhone: asTrimmedString(payload.guestPhone),
    orderNumber: asTrimmedString(payload.orderNumber),
    pickupDate: asTrimmedString(payload.pickupDate),
    pickupTime: asTrimmedString(payload.pickupTime),
    fulfilmentMethod,
    fulfilmentLabel:
      asTrimmedString(payload.fulfilmentLabel) ??
      fulfilmentLabelForMethod(fulfilmentMethod),
    notes: asTrimmedString(payload.notes),
    items,
    addons,
    total: asFiniteNumber(payload.total) ?? 0,
    delivery: parseDelivery(payload.delivery),
    dineIn: parseDineIn(payload.dineIn),
  };
}

export function dineInVenueLabel(venue: string | null): string | null {
  if (venue === "hyphen") return "Hyphen";
  if (venue === "whitebird") return "Whitebird";
  return venue;
}

export type NewOrderEmailSection = {
  label: string;
  value: string;
};

export function newOrderEmailSections(
  summary: NewOrderNotificationSummary,
): NewOrderEmailSection[] {
  const sections: NewOrderEmailSection[] = [];
  if (summary.orderNumber) {
    sections.push({ label: "Order", value: summary.orderNumber });
  }
  if (summary.guestName) {
    sections.push({ label: "Customer", value: summary.guestName });
  }
  if (summary.guestPhone) {
    sections.push({ label: "WhatsApp", value: summary.guestPhone });
  }
  if (summary.pickupDate) {
    sections.push({
      label: "Collection",
      value: formatShortBusinessDate(summary.pickupDate),
    });
  }
  if (summary.pickupTime) {
    sections.push({
      label: "Collection time",
      value: formatPickupTime(summary.pickupTime),
    });
  }
  if (summary.fulfilmentLabel) {
    sections.push({ label: "Fulfilment", value: summary.fulfilmentLabel });
  }
  if (summary.fulfilmentMethod === "dine_in" && summary.dineIn) {
    const venue = dineInVenueLabel(summary.dineIn.venue);
    if (venue) sections.push({ label: "Venue", value: venue });
    if (summary.dineIn.guestCount != null) {
      sections.push({
        label: "Guests",
        value: String(summary.dineIn.guestCount),
      });
    }
  }
  if (summary.fulfilmentMethod === "delivery" && summary.delivery) {
    const address = [
      summary.delivery.addressLine1,
      summary.delivery.addressLine2,
      [summary.delivery.postcode, summary.delivery.city]
        .filter(Boolean)
        .join(" "),
      summary.delivery.state,
    ]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(", ");
    sections.push({
      label: "Recipient",
      value: `${summary.delivery.recipientName} · ${summary.delivery.recipientPhone}`,
    });
    if (address) sections.push({ label: "Address", value: address });
  }
  return sections;
}

export function newOrderEmailOrderLines(
  summary: NewOrderNotificationSummary,
): string[] {
  return [
    ...summary.items.map(formatNewOrderItemLine),
    ...summary.addons.map(
      (addon) =>
        `${addon.name} × ${addon.quantity} — ${formatNewOrderRm(addon.lineTotal)}`,
    ),
  ];
}
