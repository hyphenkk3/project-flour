/**
 * Post-payment one-time customer change.
 *
 * Uses existing orders.post_payment_customer_change_* /
 * post_payment_change_override_* columns. Pre-payment edits never consume
 * the allowance. Existing cake-line edits after payment are not the normal
 * one-time change.
 */

import type { RoleCode } from "@/types/staff";

export const POST_PAYMENT_CUSTOMER_CHANGE_ERRORS = {
  used: "The one-time post-payment customer change has already been used. Manager or Owner override is required for any further change or cancellation.",
  cakeLine:
    "Existing cake lines cannot be changed or removed after payment as the normal one-time customer change. Adding a new cake on the same pickup date is allowed. Manager or Owner override is required to change existing cakes.",
  overrideNotAuthorized:
    "Only Manager or Owner can override the one-time post-payment customer change restriction.",
} as const;

export type PostPaymentCakeLine = {
  cakeId: string;
  cakeSizeId: string;
  quantity: number;
};

export type PostPaymentComplimentaryLine = {
  typeId: string | null;
  name: string;
  quantity: number;
};

export type PostPaymentAddonLine = {
  code: string;
  quantity: number;
  messages?: Array<string | null>;
};

export type PostPaymentSaveProposed = {
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  pickupDate: string;
  pickupTime: string;
  customerNotes: string;
  fulfilmentMethod: string;
  deliveryKey?: string;
  items: PostPaymentCakeLine[];
  complimentary: PostPaymentComplimentaryLine[];
  paidAddons: PostPaymentAddonLine[];
};

export type PostPaymentSaveClassification = {
  existingCakeLineAltered: boolean;
  newCakeLineAdded: boolean;
  pickupOrFulfilmentChanged: boolean;
  customerFacingChange: boolean;
};

export type PostPaymentSaveDecision =
  | { action: "allow_unpaid" }
  | { action: "allow_staff_only" }
  | { action: "consume" }
  | { action: "override" }
  | { action: "block_used"; error: string }
  | { action: "block_cake_line"; error: string }
  | { action: "block_override_role"; error: string };

export function canOverridePostPaymentCustomerChange(role: RoleCode): boolean {
  return role === "owner" || role === "manager";
}

export function postPaymentChangeAlreadyUsed(count: number | null | undefined): boolean {
  return (count ?? 0) >= 1;
}

function cakeLineKey(line: PostPaymentCakeLine): string {
  return `${line.cakeId}::${line.cakeSizeId}`;
}

function cakeQtyMap(lines: PostPaymentCakeLine[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    const key = cakeLineKey(line);
    map.set(key, (map.get(key) ?? 0) + line.quantity);
  }
  return map;
}

function normalizeClock(value: string): string {
  const trimmed = value.trim();
  return trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed;
}

function normalizeNotes(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function complimentaryKey(line: PostPaymentComplimentaryLine): string {
  return `${line.typeId ?? ""}::${line.name.trim().toLowerCase()}`;
}

function addonFingerprint(lines: PostPaymentAddonLine[]): string {
  return [...lines]
    .map((line) => {
      const messages = (line.messages ?? [])
        .map((message) => (message ?? "").trim())
        .join("|");
      return `${line.code}:${line.quantity}:${messages}`;
    })
    .sort()
    .join("\n");
}

function complimentaryFingerprint(
  lines: PostPaymentComplimentaryLine[],
): string {
  const qty = new Map<string, number>();
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const key = complimentaryKey(line);
    qty.set(key, (qty.get(key) ?? 0) + line.quantity);
  }
  return [...qty.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, quantity]) => `${key}:${quantity}`)
    .join("\n");
}

export function classifyPaidOrderSave(
  before: {
    customerName: string;
    phone: string;
    email: string;
    pickupDate: string;
    pickupTime: string;
    notes: string | null;
    fulfilmentMethod: string;
    delivery: {
      recipientName: string;
      recipientPhone: string;
      addressLine1: string;
      addressLine2?: string | null;
      postcode: string;
      city: string;
      state: string;
    } | null;
    items: PostPaymentCakeLine[];
    complimentaryItems: Array<{
      complimentaryItemTypeId: string | null;
      name: string;
      quantity: number;
    }>;
    paidAddons: Array<{
      code: string;
      quantity: number;
      writtenMessage?: string | null;
      messages?: Array<{ writtenMessage: string | null }>;
    }>;
  },
  proposed: PostPaymentSaveProposed,
): PostPaymentSaveClassification {
  const beforeCakes = cakeQtyMap(
    before.items.map((item) => ({
      cakeId: item.cakeId,
      cakeSizeId: item.cakeSizeId,
      quantity: item.quantity,
    })),
  );
  const proposedCakes = cakeQtyMap(proposed.items);

  let existingCakeLineAltered = false;
  for (const [key, qty] of beforeCakes) {
    if ((proposedCakes.get(key) ?? 0) !== qty) {
      existingCakeLineAltered = true;
      break;
    }
  }

  let newCakeLineAdded = false;
  for (const key of proposedCakes.keys()) {
    if (!beforeCakes.has(key)) {
      newCakeLineAdded = true;
      break;
    }
  }

  const beforeDeliveryKey = before.delivery
    ? [
        before.delivery.recipientName,
        before.delivery.recipientPhone,
        before.delivery.addressLine1,
        before.delivery.addressLine2 ?? "",
        before.delivery.postcode,
        before.delivery.city,
        before.delivery.state,
      ].join("\u0000")
    : "";

  const pickupOrFulfilmentChanged =
    before.pickupDate !== proposed.pickupDate.trim() ||
    normalizeClock(before.pickupTime) !== normalizeClock(proposed.pickupTime) ||
    before.fulfilmentMethod !== proposed.fulfilmentMethod ||
    beforeDeliveryKey !== (proposed.deliveryKey ?? beforeDeliveryKey);

  const customerFieldsChanged =
    before.customerName.trim() !== proposed.guestName.trim() ||
    before.phone.trim() !== proposed.guestPhone.trim() ||
    before.email.trim() !== proposed.guestEmail.trim() ||
    normalizeNotes(before.notes) !== normalizeNotes(proposed.customerNotes);

  const complimentaryChanged =
    complimentaryFingerprint(
      before.complimentaryItems.map((item) => ({
        typeId: item.complimentaryItemTypeId,
        name: item.name,
        quantity: item.quantity,
      })),
    ) !== complimentaryFingerprint(proposed.complimentary);

  const addonsChanged =
    addonFingerprint(
      before.paidAddons.map((item) => ({
        code: item.code,
        quantity: item.quantity,
        messages:
          item.messages?.length
            ? item.messages.map((message) => message.writtenMessage ?? null)
            : [item.writtenMessage ?? null],
      })),
    ) !== addonFingerprint(proposed.paidAddons);

  const customerFacingChange =
    existingCakeLineAltered ||
    newCakeLineAdded ||
    pickupOrFulfilmentChanged ||
    customerFieldsChanged ||
    complimentaryChanged ||
    addonsChanged;

  return {
    existingCakeLineAltered,
    newCakeLineAdded,
    pickupOrFulfilmentChanged,
    customerFacingChange,
  };
}

export function decidePostPaymentSave(input: {
  status: string;
  changeCount: number;
  role: RoleCode;
  override: boolean;
  classification: PostPaymentSaveClassification;
}): PostPaymentSaveDecision {
  if (input.status !== "paid") {
    return { action: "allow_unpaid" };
  }

  const overrideRequested = input.override;
  if (overrideRequested && !canOverridePostPaymentCustomerChange(input.role)) {
    return {
      action: "block_override_role",
      error: POST_PAYMENT_CUSTOMER_CHANGE_ERRORS.overrideNotAuthorized,
    };
  }

  if (
    input.classification.existingCakeLineAltered &&
    !overrideRequested
  ) {
    return {
      action: "block_cake_line",
      error: POST_PAYMENT_CUSTOMER_CHANGE_ERRORS.cakeLine,
    };
  }

  if (!input.classification.customerFacingChange) {
    return { action: "allow_staff_only" };
  }

  if (!postPaymentChangeAlreadyUsed(input.changeCount)) {
    return overrideRequested ? { action: "override" } : { action: "consume" };
  }

  if (overrideRequested) {
    return { action: "override" };
  }

  return {
    action: "block_used",
    error: POST_PAYMENT_CUSTOMER_CHANGE_ERRORS.used,
  };
}

export function decidePostPaymentCancel(input: {
  status: string;
  changeCount: number;
  role: RoleCode;
  override: boolean;
}): { ok: true; needsOverrideStamp: boolean } | { ok: false; error: string } {
  if (input.status !== "paid" || !postPaymentChangeAlreadyUsed(input.changeCount)) {
    return { ok: true, needsOverrideStamp: false };
  }
  if (!input.override) {
    return { ok: false, error: POST_PAYMENT_CUSTOMER_CHANGE_ERRORS.used };
  }
  if (!canOverridePostPaymentCustomerChange(input.role)) {
    return {
      ok: false,
      error: POST_PAYMENT_CUSTOMER_CHANGE_ERRORS.overrideNotAuthorized,
    };
  }
  return { ok: true, needsOverrideStamp: true };
}
