/**
 * Operations approval requests — typed exception workflow.
 *
 * Customer Operations executes normal preorder work directly.
 * When an existing restriction blocks that role, they request approval for a
 * specific order + specific proposed mutation. Owner and Manager approve/reject
 * the three supported types. Approval executes that mutation. It does not grant
 * temporary extra role power. Time passing does not expire a pending request.
 *
 * Delivery fee request/resolve remains a separate existing workflow.
 */

import {
  calendarDaysBetween,
  isDifferentBusinessMonth,
  toBusinessDateKey,
} from "@/lib/dates";
import type { RoleCode } from "@/types/staff";
import type { GuestOrderStatus } from "@/types/storefront";
import { evaluateRm10CardRuleFit } from "@/engines/orders/promotions";

export const OPERATIONS_APPROVAL_TYPES = [
  "discount_exception",
  "late_order_edit",
  "cross_month_pickup",
] as const;

export type OperationsApprovalType = (typeof OPERATIONS_APPROVAL_TYPES)[number];

export const OPERATIONS_APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type OperationsApprovalStatus =
  (typeof OPERATIONS_APPROVAL_STATUSES)[number];

export const STALE_APPROVAL_MESSAGE =
  "This approval request is stale. The order has changed since it was created. Review the order and create a new request if the exception is still needed.";

export const OPERATIONS_APPROVAL_TYPE_LABELS: Record<
  OperationsApprovalType,
  string
> = {
  discount_exception: "Discount exception",
  late_order_edit: "Late order edit",
  cross_month_pickup: "Cross-month pickup",
};

export type DiscountExceptionAction = "redeem_rm10" | "change_august_to_rm10";

export type DiscountExceptionPayload = {
  kind: "discount_exception";
  action: DiscountExceptionAction;
  voucherNumber: string;
  expiryDate: string;
  eligibilityReason: string;
  currentAmountDue: number;
  requestedAmountDue: number;
};

export type CrossMonthPickupPayload = {
  kind: "cross_month_pickup";
  currentPickupDate: string;
  currentPickupTime: string;
  proposedPickupDate: string;
  proposedPickupTime: string;
  fulfilmentMethod: string;
};

export type LateOrderEditProposedItem = {
  cakeId: string;
  cakeSizeId: string;
  quantity: number;
  unitPrice: number;
  cakeName: string;
  sizeLabel: string;
};

/** Canonical paid-add-on snapshot for late_order_edit (matches sync_guest_order_paid_addons). */
export type LateOrderEditPaidAddon = {
  code: string;
  name: string;
  quantity: number;
  messages: Array<string | null>;
};

export type LateOrderEditSnapshot = {
  pickupDate: string;
  pickupTime: string;
  items: LateOrderEditProposedItem[];
  paidAddons: LateOrderEditPaidAddon[];
};

export type LateOrderEditPayload = {
  kind: "late_order_edit";
  current?: LateOrderEditSnapshot;
  proposed: {
    pickupDate?: string;
    pickupTime?: string;
    items?: LateOrderEditProposedItem[];
    paidAddons?: LateOrderEditPaidAddon[];
  };
};

export type OperationsApprovalPayload =
  | DiscountExceptionPayload
  | CrossMonthPickupPayload
  | LateOrderEditPayload;

export type OperationsApprovalFingerprint = {
  pickupDate: string;
  pickupTime: string;
  status: string;
  hasRm10: boolean;
  hasAugust: boolean;
  itemsSignature: string;
  paidAddonsSignature: string;
};

export type OperationsApprovalRecord = {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  pickupDate: string;
  pickupTime: string;
  requestType: OperationsApprovalType;
  status: OperationsApprovalStatus;
  reason: string;
  payload: OperationsApprovalPayload;
  orderFingerprint: OperationsApprovalFingerprint;
  requestedBy: string;
  requestedByName: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewerNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export function isOperationsApprovalType(
  value: string,
): value is OperationsApprovalType {
  return (OPERATIONS_APPROVAL_TYPES as readonly string[]).includes(value);
}

export function isOperationsApprovalStatus(
  value: string,
): value is OperationsApprovalStatus {
  return (OPERATIONS_APPROVAL_STATUSES as readonly string[]).includes(value);
}

/** Customer Operations may create requests. Owner executes exceptions directly. */
export function canRequestOperationsApproval(role: RoleCode): boolean {
  return role === "customer_operations";
}

/**
 * Review authority for a typed request.
 * Owner and Manager: all three supported types.
 * Manager fee Approve/Reject stays on the independent fee-request workflow.
 * Manager review does not grant the Operations board.
 */
export function canReviewOperationsApprovalType(
  role: RoleCode,
  requestType: string,
): boolean {
  if (!isOperationsApprovalType(requestType)) return false;
  if (role !== "owner" && role !== "manager") return false;
  return (
    requestType === "discount_exception" ||
    requestType === "late_order_edit" ||
    requestType === "cross_month_pickup"
  );
}

/** Inbox page for pending approvals — Owner + Manager, not the Operations board. */
export function canAccessOperationsApprovalsInbox(role: RoleCode): boolean {
  return role === "owner" || role === "manager";
}

export function canCancelOperationsApproval(input: {
  role: RoleCode;
  staffId: string;
  requestedBy: string;
  status: OperationsApprovalStatus;
}): boolean {
  if (input.status !== "pending") return false;
  if (input.role === "owner") return true;
  return input.staffId === input.requestedBy;
}

export function requesterCannotDecideOwnRequest(input: {
  actorStaffId: string;
  requestedBy: string;
}): boolean {
  return input.actorStaffId === input.requestedBy;
}

export function approvalTypeLabel(type: OperationsApprovalType): string {
  return OPERATIONS_APPROVAL_TYPE_LABELS[type];
}

/**
 * Calendar-date 2-day change cutoff (NOT 48 elapsed hours).
 * Business timezone: Asia/Singapore (`toBusinessDateKey`).
 *
 * For pickup date D, normal edit is allowed until 23:59:59 on D − 2.
 * Pickup time-of-day is irrelevant.
 *
 * Restricted when Singapore calendar today is fewer than 2 whole days
 * before the pickup date (`calendarDaysBetween(today, pickupDate) < 2`).
 */
export function isWithinTwoDayChangeCutoff(input: {
  pickupDate: string;
  now?: Date;
}): boolean {
  const today = toBusinessDateKey(input.now ?? new Date());
  const days = calendarDaysBetween(today, input.pickupDate);
  if (days === null) return false;
  return days < 2;
}

export function lateOrderEditRestrictionReason(input: {
  pickupDate: string;
  createdAt?: string;
  status?: GuestOrderStatus;
  now?: Date;
}): string | null {
  if (!isWithinTwoDayChangeCutoff({ pickupDate: input.pickupDate, now: input.now })) {
    return null;
  }
  return "This order is within the 2-day change cutoff.";
}

export function itemsSignatureFromLines(
  items: Array<{ cakeId: string; cakeSizeId: string; quantity: number }>,
): string {
  return [...items]
    .map(
      (item) =>
        `${item.cakeId}:${item.cakeSizeId}:${item.quantity}`,
    )
    .sort()
    .join("|");
}

export function paidAddonsSignatureFromLines(
  addons: Array<{
    code: string;
    quantity: number;
    messages?: Array<string | null>;
  }>,
): string {
  return [...addons]
    .map((addon) => {
      const quantity = Math.max(0, Math.floor(Number(addon.quantity) || 0));
      const slots = Array.from({ length: quantity }, (_, index) =>
        (addon.messages?.[index] ?? "").trim(),
      );
      return `${addon.code}:${quantity}:${slots.join("~")}`;
    })
    .sort()
    .join("|");
}

export function buildOperationsApprovalFingerprint(input: {
  pickupDate: string;
  pickupTime: string;
  status: string;
  hasRm10: boolean;
  hasAugust: boolean;
  items: Array<{ cakeId: string; cakeSizeId: string; quantity: number }>;
  paidAddons?: Array<{
    code: string;
    quantity: number;
    messages?: Array<string | null>;
  }>;
}): OperationsApprovalFingerprint {
  return {
    pickupDate: input.pickupDate,
    pickupTime: normalizeFingerprintTime(input.pickupTime),
    status: input.status,
    hasRm10: input.hasRm10,
    hasAugust: input.hasAugust,
    itemsSignature: itemsSignatureFromLines(input.items),
    paidAddonsSignature: paidAddonsSignatureFromLines(input.paidAddons ?? []),
  };
}

export function fingerprintsMatch(
  stored: OperationsApprovalFingerprint,
  current: OperationsApprovalFingerprint,
  requestType: OperationsApprovalType,
): boolean {
  if (stored.status !== current.status) return false;
  if (stored.pickupDate !== current.pickupDate) return false;
  if (stored.pickupTime !== current.pickupTime) return false;
  if (requestType === "discount_exception") {
    return stored.hasRm10 === current.hasRm10 && stored.hasAugust === current.hasAugust;
  }
  if (requestType === "late_order_edit") {
    return (
      stored.itemsSignature === current.itemsSignature &&
      stored.paidAddonsSignature === current.paidAddonsSignature
    );
  }
  return true;
}

export function isStaleOperationsApproval(input: {
  requestType: OperationsApprovalType;
  stored: OperationsApprovalFingerprint;
  current: OperationsApprovalFingerprint;
}): boolean {
  return !fingerprintsMatch(input.stored, input.current, input.requestType);
}

/** Direct RM10 apply is the valid path; approval is only for expiry/invalid exceptions. */
export function discountExceptionEligibilityReason(input: {
  items: Array<{ sizeLabel: string }>;
  orderDate: string;
  pickupDate: string;
  expiryDate: string;
  hasAugustPromo: boolean;
  hasRm10Card: boolean;
}): { canRequest: boolean; reason: string | null } {
  if (input.hasRm10Card) {
    return {
      canRequest: false,
      reason: "An RM10 Discount Card is already applied to this order.",
    };
  }
  const fit = evaluateRm10CardRuleFit({
    items: input.items,
    orderDate: input.orderDate,
    pickupDate: input.pickupDate,
    expiryDate: input.expiryDate,
  });
  if (fit.eligible) {
    return {
      canRequest: false,
      reason: null,
    };
  }
  if (fit.reason?.includes('6" or 8"')) {
    return { canRequest: false, reason: fit.reason };
  }
  return { canRequest: true, reason: fit.reason };
}

export function projectedAmountDueAfterRm10(input: {
  currentAmountDue: number;
  action: DiscountExceptionAction;
}): number {
  if (input.action === "change_august_to_rm10") {
    return input.currentAmountDue + 20 - 10;
  }
  return input.currentAmountDue - 10;
}

export function requiresCrossMonthApproval(input: {
  currentPickupDate: string;
  proposedPickupDate: string;
}): boolean {
  return isDifferentBusinessMonth(
    input.currentPickupDate,
    input.proposedPickupDate,
  );
}

export function parseOperationsApprovalPayload(
  requestType: OperationsApprovalType,
  raw: unknown,
): OperationsApprovalPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (requestType === "discount_exception") {
    const action = row.action;
    const voucherNumber = stringField(row.voucher_number ?? row.voucherNumber);
    const expiryDate = stringField(row.expiry_date ?? row.expiryDate);
    const eligibilityReason = stringField(
      row.eligibility_reason ?? row.eligibilityReason,
    );
    if (
      (action !== "redeem_rm10" && action !== "change_august_to_rm10") ||
      !voucherNumber ||
      !expiryDate
    ) {
      return null;
    }
    return {
      kind: "discount_exception",
      action,
      voucherNumber,
      expiryDate,
      eligibilityReason: eligibilityReason ?? "",
      currentAmountDue: Number(row.current_amount_due ?? row.currentAmountDue ?? 0),
      requestedAmountDue: Number(
        row.requested_amount_due ?? row.requestedAmountDue ?? 0,
      ),
    };
  }
  if (requestType === "cross_month_pickup") {
    const currentPickupDate = stringField(
      row.current_pickup_date ?? row.currentPickupDate,
    );
    const proposedPickupDate = stringField(
      row.proposed_pickup_date ?? row.proposedPickupDate,
    );
    const currentPickupTime = stringField(
      row.current_pickup_time ?? row.currentPickupTime,
    );
    const proposedPickupTime = stringField(
      row.proposed_pickup_time ?? row.proposedPickupTime,
    );
    if (!currentPickupDate || !proposedPickupDate || !proposedPickupTime) {
      return null;
    }
    return {
      kind: "cross_month_pickup",
      currentPickupDate,
      currentPickupTime: currentPickupTime ?? "",
      proposedPickupDate,
      proposedPickupTime,
      fulfilmentMethod: stringField(row.fulfilment_method ?? row.fulfilmentMethod) ?? "pickup",
    };
  }
  const proposedRaw =
    row.proposed && typeof row.proposed === "object"
      ? (row.proposed as Record<string, unknown>)
      : row;
  const currentRaw =
    row.current && typeof row.current === "object"
      ? (row.current as Record<string, unknown>)
      : null;
  const pickupDate = stringField(proposedRaw.pickup_date ?? proposedRaw.pickupDate);
  const pickupTime = stringField(proposedRaw.pickup_time ?? proposedRaw.pickupTime);
  const items = parseLateEditItems(proposedRaw.items);
  const paidAddons = parseLateEditPaidAddons(
    proposedRaw.paid_addons ?? proposedRaw.paidAddons,
  );
  if (
    !pickupDate &&
    !pickupTime &&
    (!items || items.length === 0) &&
    paidAddons === undefined
  ) {
    return null;
  }
  const currentPickupDate = currentRaw
    ? stringField(currentRaw.pickup_date ?? currentRaw.pickupDate)
    : null;
  const currentPickupTime = currentRaw
    ? stringField(currentRaw.pickup_time ?? currentRaw.pickupTime)
    : null;
  const currentItems = currentRaw ? parseLateEditItems(currentRaw.items) : undefined;
  const currentPaidAddons = currentRaw
    ? parseLateEditPaidAddons(currentRaw.paid_addons ?? currentRaw.paidAddons)
    : undefined;
  return {
    kind: "late_order_edit",
    current:
      currentPickupDate && currentPickupTime
        ? {
            pickupDate: currentPickupDate,
            pickupTime: currentPickupTime,
            items: currentItems ?? [],
            paidAddons: currentPaidAddons ?? [],
          }
        : undefined,
    proposed: {
      pickupDate: pickupDate ?? undefined,
      pickupTime: pickupTime ?? undefined,
      items,
      paidAddons,
    },
  };
}

export function parseOperationsApprovalFingerprint(
  raw: unknown,
): OperationsApprovalFingerprint | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const pickupDate = stringField(row.pickup_date ?? row.pickupDate);
  const pickupTime = stringField(row.pickup_time ?? row.pickupTime);
  const status = stringField(row.status);
  if (!pickupDate || pickupTime == null || !status) return null;
  return {
    pickupDate,
    pickupTime: normalizeFingerprintTime(pickupTime),
    status,
    hasRm10: Boolean(row.has_rm10 ?? row.hasRm10),
    hasAugust: Boolean(row.has_august ?? row.hasAugust),
    itemsSignature: stringField(row.items_signature ?? row.itemsSignature) ?? "",
    paidAddonsSignature:
      stringField(row.paid_addons_signature ?? row.paidAddonsSignature) ?? "",
  };
}

export function discountExceptionToRpcPayload(
  payload: DiscountExceptionPayload,
): Record<string, unknown> {
  return {
    kind: "discount_exception",
    action: payload.action,
    voucher_number: payload.voucherNumber,
    expiry_date: payload.expiryDate,
    eligibility_reason: payload.eligibilityReason,
    current_amount_due: payload.currentAmountDue,
    requested_amount_due: payload.requestedAmountDue,
  };
}

export function crossMonthPayloadToRpc(
  payload: CrossMonthPickupPayload,
): Record<string, unknown> {
  return {
    kind: "cross_month_pickup",
    current_pickup_date: payload.currentPickupDate,
    current_pickup_time: payload.currentPickupTime,
    proposed_pickup_date: payload.proposedPickupDate,
    proposed_pickup_time: payload.proposedPickupTime,
    fulfilment_method: payload.fulfilmentMethod,
  };
}

export function lateOrderEditPayloadToRpc(
  payload: LateOrderEditPayload,
): Record<string, unknown> {
  return {
    kind: "late_order_edit",
    current: payload.current
      ? {
          pickup_date: payload.current.pickupDate,
          pickup_time: payload.current.pickupTime,
          items: payload.current.items.map(lateEditItemToRpc),
          paid_addons: payload.current.paidAddons.map(lateEditPaidAddonToRpc),
        }
      : null,
    proposed: {
      pickup_date: payload.proposed.pickupDate ?? null,
      pickup_time: payload.proposed.pickupTime ?? null,
      items: (payload.proposed.items ?? []).map(lateEditItemToRpc),
      ...(payload.proposed.paidAddons !== undefined
        ? {
            paid_addons: payload.proposed.paidAddons.map(lateEditPaidAddonToRpc),
          }
        : {}),
    },
  };
}

export function formatApprovalAge(createdAt: string, now = new Date()): string {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return createdAt;
  const deltaMs = Math.max(0, now.getTime() - created.getTime());
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function lateEditItemToRpc(item: LateOrderEditProposedItem): Record<string, unknown> {
  return {
    cake_id: item.cakeId,
    cake_size_id: item.cakeSizeId,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    cake_name: item.cakeName,
    size_label: item.sizeLabel,
  };
}

function lateEditPaidAddonToRpc(
  addon: LateOrderEditPaidAddon,
): Record<string, unknown> {
  return {
    code: addon.code,
    name: addon.name,
    quantity: addon.quantity,
    messages: addon.messages,
  };
}

function parseLateEditItems(itemsRaw: unknown): LateOrderEditProposedItem[] | undefined {
  if (!Array.isArray(itemsRaw)) return undefined;
  return itemsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      const cakeId = stringField(entry.cake_id ?? entry.cakeId);
      const cakeSizeId = stringField(entry.cake_size_id ?? entry.cakeSizeId);
      const cakeName = stringField(entry.cake_name ?? entry.cakeName);
      const sizeLabel = stringField(entry.size_label ?? entry.sizeLabel);
      const quantity = Number(entry.quantity ?? 0);
      const unitPrice = Number(entry.unit_price ?? entry.unitPrice ?? 0);
      if (!cakeId || !cakeSizeId || !cakeName || !sizeLabel) return null;
      if (!Number.isInteger(quantity) || quantity < 1) return null;
      return {
        cakeId,
        cakeSizeId,
        quantity,
        unitPrice,
        cakeName,
        sizeLabel,
      };
    })
    .filter((item): item is LateOrderEditProposedItem => item != null);
}

function parseLateEditPaidAddons(
  addonsRaw: unknown,
): LateOrderEditPaidAddon[] | undefined {
  if (!Array.isArray(addonsRaw)) return undefined;
  return addonsRaw
    .map((addon) => {
      if (!addon || typeof addon !== "object") return null;
      const entry = addon as Record<string, unknown>;
      const code = stringField(entry.code);
      if (!code) return null;
      const quantity = Number(entry.quantity ?? 0);
      if (!Number.isInteger(quantity) || quantity < 1) return null;
      const name = stringField(entry.name) ?? code;
      let messages: Array<string | null> = [];
      if (Array.isArray(entry.messages)) {
        messages = entry.messages.map((message) => {
          if (message == null) return null;
          if (typeof message === "string") {
            const trimmed = message.trim();
            return trimmed.length > 0 ? trimmed : null;
          }
          if (typeof message === "object") {
            const slot = message as Record<string, unknown>;
            return stringField(slot.written_message ?? slot.writtenMessage);
          }
          return null;
        });
      }
      while (messages.length < quantity) messages.push(null);
      return {
        code,
        name,
        quantity,
        messages: messages.slice(0, quantity),
      };
    })
    .filter((addon): addon is LateOrderEditPaidAddon => addon != null);
}

function stringField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeFingerprintTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value.trim();
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}
