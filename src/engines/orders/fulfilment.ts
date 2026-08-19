/**
 * M4-P2 — fulfilment / delivery normalization + Owner create/edit helpers.
 * Slice 4: Confirmation body, Crew gate, Quick View Delivery summary.
 */

import type {
  DeliveryFeeRequestStatus,
  RecipientNotifyPreference,
  StorefrontDeliveryFeeRequest,
  StorefrontOrderDelivery,
  StorefrontOrderDineInReservation,
  StorefrontOrderFulfilmentMethod,
  StorefrontProcessingFeeRequest,
} from "@/types/storefront";

const NOTIFY_VALUES = new Set<RecipientNotifyPreference>([
  "inform_recipient",
  "do_not_inform_recipient",
]);

/** Owner Create supports Pickup | Delivery only (drive_through stays DB-only). */
export type OwnerCreateFulfilmentMethod = "pickup" | "delivery";

export const OWNER_CREATE_FULFILMENT_OPTIONS = [
  { value: "pickup" as const, label: "Pickup" },
  { value: "delivery" as const, label: "Delivery" },
];

export const RECIPIENT_NOTIFY_OPTIONS = [
  {
    value: "inform_recipient" as const,
    label: "Inform Recipient",
  },
  {
    value: "do_not_inform_recipient" as const,
    label: "DO NOT INFORM RECIPIENT",
  },
];

/** Owner Workspace section title (view + edit chrome). Drive-through → Delivery label avoided; treat as Pickup chrome until P2 expands. */
export function workspaceFulfilmentSectionTitle(
  method: StorefrontOrderFulfilmentMethod | null | undefined,
): "Pickup" | "Delivery" | "Dine-in" {
  if (method === "delivery") return "Delivery";
  if (method === "dine_in") return "Dine-in";
  return "Pickup";
}

export function workspaceScheduleDateLabel(
  method: StorefrontOrderFulfilmentMethod | null | undefined,
): string {
  if (method === "delivery") return "Delivery date";
  if (method === "dine_in") return "Dine-in date";
  return "Pickup date";
}

export function workspaceScheduleTimeLabel(
  method: StorefrontOrderFulfilmentMethod | null | undefined,
): string {
  if (method === "delivery") return "Delivery time";
  if (method === "dine_in") return "Cake serving time";
  return "Pickup time";
}

export function recipientNotifyPreferenceLabel(
  value: RecipientNotifyPreference | null | undefined,
): string | null {
  if (value === "inform_recipient") return "Inform Recipient";
  if (value === "do_not_inform_recipient") return "DO NOT INFORM RECIPIENT";
  return null;
}

/** Owner Delivery area for this workflow (create normalization; schema unchanged). */
export const OWNER_DELIVERY_CITY = "Kota Kinabalu";
export const OWNER_DELIVERY_STATE = "Sabah";

function normalizeIdentityName(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeIdentityPhone(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/[\s\-().]/g, "");
}

/**
 * Persisted-order same-person check for Workspace presentation.
 * Compares normalized ordering-customer identity to Delivery recipient.
 * No DB column — presentation only.
 */
export function isDeliveryRecipientSameAsOrderingCustomer(input: {
  customerName: string | null | undefined;
  customerPhone: string | null | undefined;
  delivery: StorefrontOrderDelivery | null | undefined;
}): boolean {
  const delivery = input.delivery;
  if (!delivery) return false;
  const customerName = normalizeIdentityName(input.customerName);
  const recipientName = normalizeIdentityName(delivery.recipientName);
  if (!customerName || !recipientName || customerName !== recipientName) {
    return false;
  }
  return (
    normalizeIdentityPhone(input.customerPhone) ===
    normalizeIdentityPhone(delivery.recipientPhone)
  );
}

/**
 * Read-only Workspace fulfilment presentation model (Slice 2 correction).
 * No edit/mutation fields — Delivery details are display-only.
 * Same-as-customer omits Notify (internal inform_recipient is not Owner-facing).
 */
export type WorkspaceFulfilmentViewModel = {
  sectionTitle: "Pickup" | "Delivery" | "Dine-in";
  dateLabel: string;
  timeLabel: string;
  isDelivery: boolean;
  isDineIn: boolean;
  delivery: StorefrontOrderDelivery | null;
  dineInReservation: StorefrontOrderDineInReservation | null;
  /** Null when Pickup, missing delivery, or recipient same as ordering customer. */
  notifyLabel: string | null;
  recipientSameAsCustomer: boolean;
};

export function buildWorkspaceFulfilmentViewModel(order: {
  fulfilmentMethod: StorefrontOrderFulfilmentMethod;
  delivery: StorefrontOrderDelivery | null;
  dineInReservation?: StorefrontOrderDineInReservation | null;
  customerName: string;
  phone: string;
}): WorkspaceFulfilmentViewModel {
  const isDelivery = order.fulfilmentMethod === "delivery";
  const isDineIn = order.fulfilmentMethod === "dine_in";
  const delivery = isDelivery ? order.delivery : null;
  const dineInReservation = isDineIn
    ? (order.dineInReservation ?? null)
    : null;
  const recipientSameAsCustomer = isDeliveryRecipientSameAsOrderingCustomer({
    customerName: order.customerName,
    customerPhone: order.phone,
    delivery,
  });
  return {
    sectionTitle: workspaceFulfilmentSectionTitle(order.fulfilmentMethod),
    dateLabel: workspaceScheduleDateLabel(order.fulfilmentMethod),
    timeLabel: workspaceScheduleTimeLabel(order.fulfilmentMethod),
    isDelivery,
    isDineIn,
    delivery,
    dineInReservation,
    recipientSameAsCustomer,
    notifyLabel:
      delivery && !recipientSameAsCustomer
        ? recipientNotifyPreferenceLabel(delivery.recipientNotifyPreference)
        : null,
  };
}
/** Unsaved New Order Delivery draft (notify null = not yet chosen). */
export type DeliveryCreateDraft = {
  recipientName: string;
  recipientPhone: string;
  addressLine1: string;
  addressLine2: string;
  postcode: string;
  city: string;
  state: string;
  recipientNotifyPreference: RecipientNotifyPreference | null;
  /**
   * Create-form helper only: Recipient was copied via Same as Customer.
   * When true, notify choice is hidden and create persists inform_recipient.
   * Does not merge ordered-by / recipient identities in the DB.
   */
  sameAsCustomer: boolean;
};

/** RPC payload shape for create_staff_guest_preorder.p_delivery */
export type DeliveryCreateRpcPayload = {
  recipient_name: string;
  recipient_phone: string;
  address_line_1: string;
  address_line_2: string | null;
  postcode: string;
  city: string;
  state: string;
  recipient_notify_preference: RecipientNotifyPreference;
};

export function defaultOwnerCreateFulfilmentMethod(): OwnerCreateFulfilmentMethod {
  return "pickup";
}

export function defaultDeliveryCreateDraft(): DeliveryCreateDraft {
  return {
    recipientName: "",
    recipientPhone: "",
    addressLine1: "",
    addressLine2: "",
    postcode: "",
    city: "",
    state: "",
    recipientNotifyPreference: null,
    sameAsCustomer: false,
  };
}

export function normalizeOwnerCreateFulfilmentMethod(
  value: string | null | undefined,
): OwnerCreateFulfilmentMethod {
  return value === "delivery" ? "delivery" : "pickup";
}

/**
 * Convenience copy only — does not link identities.
 * Activates same-as-customer helper: notify UI suppressed; create normalizes to inform_recipient.
 */
export function copyCustomerToRecipientDraft(
  draft: DeliveryCreateDraft,
  customer: { name: string; phone: string },
): DeliveryCreateDraft {
  return {
    ...draft,
    recipientName: String(customer.name ?? "").trim(),
    recipientPhone: String(customer.phone ?? "").trim(),
    sameAsCustomer: true,
    // Implementation normalization — not a customer-facing choice.
    recipientNotifyPreference: "inform_recipient",
  };
}

/**
 * Manual recipient identity edit leaves Same as Customer helper mode.
 * Clears notify so a different recipient requires an explicit choice.
 */
export function markRecipientDivergedFromCustomer(
  draft: DeliveryCreateDraft,
): DeliveryCreateDraft {
  if (!draft.sameAsCustomer) return draft;
  return {
    ...draft,
    sameAsCustomer: false,
    recipientNotifyPreference: null,
  };
}

/**
 * Build create RPC fulfilment args.
 * Pickup always sends p_delivery = null (even if draft state retains Delivery values).
 * Same-as-customer Delivery normalizes notify to inform_recipient when unset.
 * City/state are server-authoritative KK Delivery area constants (Owner UI does not collect them).
 */
export function buildCreateStaffFulfilmentRpcParams(input: {
  method: OwnerCreateFulfilmentMethod;
  delivery: DeliveryCreateDraft;
}): {
  p_fulfilment_method: OwnerCreateFulfilmentMethod;
  p_delivery: DeliveryCreateRpcPayload | null;
} {
  if (input.method !== "delivery") {
    return { p_fulfilment_method: "pickup", p_delivery: null };
  }

  let notify = normalizeRecipientNotifyPreference(
    input.delivery.recipientNotifyPreference,
  );
  if (!notify && input.delivery.sameAsCustomer) {
    notify = "inform_recipient";
  }
  if (!notify) {
    throw new Error(
      "Recipient notification preference is required for Delivery.",
    );
  }

  return {
    p_fulfilment_method: "delivery",
    p_delivery: {
      recipient_name: trimRequired(input.delivery.recipientName),
      recipient_phone: trimRequired(input.delivery.recipientPhone),
      address_line_1: trimRequired(input.delivery.addressLine1),
      address_line_2: trimOptionalNull(input.delivery.addressLine2),
      postcode: trimRequired(input.delivery.postcode),
      city: OWNER_DELIVERY_CITY,
      state: OWNER_DELIVERY_STATE,
      recipient_notify_preference: notify,
    },
  };
}

/**
 * Client/server create validation for Owner fulfilment.
 * Returns an Owner-facing error string, or null when valid.
 * Server RPC remains authoritative.
 * City/state are not Owner-entered (normalized on create).
 */
export function validateOwnerCreateFulfilment(input: {
  method: OwnerCreateFulfilmentMethod;
  pickupDate: string;
  pickupTime: string;
  delivery: DeliveryCreateDraft;
}): string | null {
  const date = trimRequired(input.pickupDate);
  const time = trimRequired(input.pickupTime);
  const isDelivery = input.method === "delivery";

  if (!date || !time) {
    return isDelivery
      ? "Please choose a delivery date and time."
      : "Please choose a pickup date and time.";
  }

  if (!isDelivery) return null;

  const d = input.delivery;
  if (!trimRequired(d.recipientName)) {
    return "Please enter the recipient name.";
  }
  if (!trimRequired(d.recipientPhone)) {
    return "Please enter the recipient phone.";
  }
  if (!trimRequired(d.addressLine1)) {
    return "Please enter address line 1.";
  }
  if (!trimRequired(d.postcode)) {
    return "Please enter the postcode.";
  }
  if (
    !d.sameAsCustomer &&
    normalizeRecipientNotifyPreference(d.recipientNotifyPreference) == null
  ) {
    return "Please choose whether to inform the recipient.";
  }

  return null;
}

/** Historical / missing method → pickup (compatibility). Never invent Delivery. */
export function normalizeFulfilmentMethod(
  value: string | null | undefined,
): StorefrontOrderFulfilmentMethod {
  if (
    value === "delivery" ||
    value === "drive_through" ||
    value === "pickup" ||
    value === "dine_in"
  ) {
    return value;
  }
  return "pickup";
}

export function normalizeRecipientNotifyPreference(
  value: string | null | undefined,
): RecipientNotifyPreference | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (NOTIFY_VALUES.has(trimmed as RecipientNotifyPreference)) {
    return trimmed as RecipientNotifyPreference;
  }
  return null;
}

function trimRequired(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function trimOptionalNull(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Map nested order_delivery_details row → DTO.
 * Returns null when no row (Pickup / missing).
 * Does not coerce Delivery method to Pickup when details are missing.
 */
function toNullableAmount(
  value: number | string | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeFeeRequestStatus(
  value: string | null | undefined,
): DeliveryFeeRequestStatus | null {
  const raw = String(value ?? "").trim();
  if (
    raw === "pending" ||
    raw === "approved" ||
    raw === "rejected" ||
    raw === "cancelled"
  ) {
    return raw;
  }
  return null;
}

function emptyDeliveryFeeRequest(): StorefrontDeliveryFeeRequest {
  return {
    status: null,
    reason: null,
    quotedAmount: null,
    requestedBy: null,
    requestedByName: null,
    requestedAt: null,
    resolvedBy: null,
    resolvedByName: null,
    resolvedAt: null,
    resolutionNote: null,
  };
}

function emptyProcessingFeeRequest(): StorefrontProcessingFeeRequest {
  return {
    kind: null,
    status: null,
    proposedAmount: null,
    reason: null,
    requestedBy: null,
    requestedByName: null,
    requestedAt: null,
    resolvedBy: null,
    resolvedByName: null,
    resolvedAt: null,
    resolutionNote: null,
  };
}

export function mapOrderDeliveryDetails(
  row:
    | {
        recipient_name?: string | null;
        recipient_phone?: string | null;
        address_line_1?: string | null;
        address_line_2?: string | null;
        postcode?: string | null;
        city?: string | null;
        state?: string | null;
        recipient_notify_preference?: string | null;
        delivery_finance_enabled?: boolean | null;
        processing_fee_applicable_amount?: number | string | null;
        processing_fee_override_amount?: number | string | null;
        processing_fee_waived?: boolean | null;
        delivery_fee_status?: string | null;
        delivery_fee_quoted_amount?: number | string | null;
        delivery_fee_waived?: boolean | null;
        delivery_fee_request_status?: string | null;
        delivery_fee_request_reason?: string | null;
        delivery_fee_request_quoted_amount?: number | string | null;
        delivery_fee_requested_by?: string | null;
        delivery_fee_requested_at?: string | null;
        delivery_fee_request_resolved_by?: string | null;
        delivery_fee_request_resolved_at?: string | null;
        delivery_fee_request_resolution_note?: string | null;
        processing_fee_request_kind?: string | null;
        processing_fee_request_status?: string | null;
        processing_fee_request_proposed_amount?: number | string | null;
        processing_fee_request_reason?: string | null;
        processing_fee_requested_by?: string | null;
        processing_fee_requested_at?: string | null;
        processing_fee_request_resolved_by?: string | null;
        processing_fee_request_resolved_at?: string | null;
        processing_fee_request_resolution_note?: string | null;
        /** Legacy Slice 1 single-slot fields (fallback only). */
        fee_request_kind?: string | null;
        fee_request_status?: string | null;
        fee_request_proposed_amount?: number | string | null;
        fee_request_reason?: string | null;
        fee_requested_by?: string | null;
        fee_requested_at?: string | null;
        fee_resolved_by?: string | null;
        fee_resolved_at?: string | null;
        fee_resolution_note?: string | null;
      }
    | null
    | undefined,
): StorefrontOrderDelivery | null {
  if (!row) return null;

  const notify = normalizeRecipientNotifyPreference(
    row.recipient_notify_preference,
  );
  if (!notify) return null;

  const recipientName = trimRequired(row.recipient_name);
  const recipientPhone = trimRequired(row.recipient_phone);
  const addressLine1 = trimRequired(row.address_line_1);
  const postcode = trimRequired(row.postcode);
  const city = trimRequired(row.city);
  const state = trimRequired(row.state);

  if (
    !recipientName ||
    !recipientPhone ||
    !addressLine1 ||
    !postcode ||
    !city ||
    !state
  ) {
    return null;
  }

  const feeStatusRaw = String(row.delivery_fee_status ?? "not_set").trim();
  const deliveryFeeStatus =
    feeStatusRaw === "quoted" || feeStatusRaw === "quoted_waived"
      ? feeStatusRaw
      : "not_set";

  let deliveryFeeRequest = emptyDeliveryFeeRequest();
  const deliveryStatus = normalizeFeeRequestStatus(
    row.delivery_fee_request_status,
  );
  if (deliveryStatus) {
    deliveryFeeRequest = {
      status: deliveryStatus,
      reason: trimOptionalNull(row.delivery_fee_request_reason),
      quotedAmount: toNullableAmount(row.delivery_fee_request_quoted_amount),
      requestedBy: trimOptionalNull(row.delivery_fee_requested_by),
      requestedByName: null,
      requestedAt: trimOptionalNull(row.delivery_fee_requested_at),
      resolvedBy: trimOptionalNull(row.delivery_fee_request_resolved_by),
      resolvedByName: null,
      resolvedAt: trimOptionalNull(row.delivery_fee_request_resolved_at),
      resolutionNote: trimOptionalNull(row.delivery_fee_request_resolution_note),
    };
  } else if (
    String(row.fee_request_kind ?? "").trim() === "delivery_waiver" &&
    normalizeFeeRequestStatus(row.fee_request_status)
  ) {
    // Slice 1 fallback before 2B-1 backfill is visible to this reader.
    deliveryFeeRequest = {
      status: normalizeFeeRequestStatus(row.fee_request_status),
      reason: trimOptionalNull(row.fee_request_reason),
      quotedAmount: toNullableAmount(row.delivery_fee_quoted_amount),
      requestedBy: trimOptionalNull(row.fee_requested_by),
      requestedByName: null,
      requestedAt: trimOptionalNull(row.fee_requested_at),
      resolvedBy: trimOptionalNull(row.fee_resolved_by),
      resolvedByName: null,
      resolvedAt: trimOptionalNull(row.fee_resolved_at),
      resolutionNote: trimOptionalNull(row.fee_resolution_note),
    };
  }

  let processingFeeRequest = emptyProcessingFeeRequest();
  const processingStatus = normalizeFeeRequestStatus(
    row.processing_fee_request_status,
  );
  const processingKindRaw = String(row.processing_fee_request_kind ?? "").trim();
  const processingKind =
    processingKindRaw === "processing_override" ||
    processingKindRaw === "processing_waiver"
      ? processingKindRaw
      : null;
  if (processingStatus) {
    processingFeeRequest = {
      kind: processingKind,
      status: processingStatus,
      proposedAmount: toNullableAmount(
        row.processing_fee_request_proposed_amount,
      ),
      reason: trimOptionalNull(row.processing_fee_request_reason),
      requestedBy: trimOptionalNull(row.processing_fee_requested_by),
      requestedByName: null,
      requestedAt: trimOptionalNull(row.processing_fee_requested_at),
      resolvedBy: trimOptionalNull(row.processing_fee_request_resolved_by),
      resolvedByName: null,
      resolvedAt: trimOptionalNull(row.processing_fee_request_resolved_at),
      resolutionNote: trimOptionalNull(
        row.processing_fee_request_resolution_note,
      ),
    };
  } else {
    const legacyKind = String(row.fee_request_kind ?? "").trim();
    if (
      (legacyKind === "processing_override" ||
        legacyKind === "processing_waiver") &&
      normalizeFeeRequestStatus(row.fee_request_status)
    ) {
      processingFeeRequest = {
        kind: legacyKind,
        status: normalizeFeeRequestStatus(row.fee_request_status),
        proposedAmount: toNullableAmount(row.fee_request_proposed_amount),
        reason: trimOptionalNull(row.fee_request_reason),
        requestedBy: trimOptionalNull(row.fee_requested_by),
        requestedByName: null,
        requestedAt: trimOptionalNull(row.fee_requested_at),
        resolvedBy: trimOptionalNull(row.fee_resolved_by),
        resolvedByName: null,
        resolvedAt: trimOptionalNull(row.fee_resolved_at),
        resolutionNote: trimOptionalNull(row.fee_resolution_note),
      };
    }
  }

  return {
    recipientName,
    recipientPhone,
    addressLine1,
    addressLine2: trimOptionalNull(row.address_line_2),
    postcode,
    city,
    state,
    recipientNotifyPreference: notify,
    financeEnabled: Boolean(row.delivery_finance_enabled),
    processingFeeApplicableAmount: toNullableAmount(
      row.processing_fee_applicable_amount,
    ),
    processingFeeOverrideAmount: toNullableAmount(
      row.processing_fee_override_amount,
    ),
    processingFeeWaived: Boolean(row.processing_fee_waived),
    deliveryFeeStatus,
    deliveryFeeQuotedAmount: toNullableAmount(row.delivery_fee_quoted_amount),
    deliveryFeeWaived: Boolean(row.delivery_fee_waived),
    deliveryFeeRequest,
    processingFeeRequest,
  };
}

function normalizeTimeForCompare(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  const parts = raw.split(":");
  if (parts.length < 2) return raw;
  return `${parts[0]!.padStart(2, "0")}:${parts[1]!.padStart(2, "0")}`;
}

/** Historical / non-governed Delivery finance defaults on DTO. */
export function defaultDeliveryFinanceDtoFields(): Pick<
  StorefrontOrderDelivery,
  | "financeEnabled"
  | "processingFeeApplicableAmount"
  | "processingFeeOverrideAmount"
  | "processingFeeWaived"
  | "deliveryFeeStatus"
  | "deliveryFeeQuotedAmount"
  | "deliveryFeeWaived"
  | "deliveryFeeRequest"
  | "processingFeeRequest"
> {
  return {
    financeEnabled: false,
    processingFeeApplicableAmount: null,
    processingFeeOverrideAmount: null,
    processingFeeWaived: false,
    deliveryFeeStatus: "not_set",
    deliveryFeeQuotedAmount: null,
    deliveryFeeWaived: false,
    deliveryFeeRequest: emptyDeliveryFeeRequest(),
    processingFeeRequest: emptyProcessingFeeRequest(),
  };
}

function serializeDeliveryForConfirmation(
  delivery: StorefrontOrderDelivery | null | undefined,
): string {
  if (!delivery) return "";
  // Fee request queue fields are not Confirmation-material until approved.
  return [
    trimRequired(delivery.recipientName),
    trimRequired(delivery.recipientPhone),
    trimRequired(delivery.addressLine1),
    trimOptionalNull(delivery.addressLine2) ?? "",
    trimRequired(delivery.postcode),
    trimRequired(delivery.city),
    trimRequired(delivery.state),
    delivery.recipientNotifyPreference,
    delivery.financeEnabled ? "1" : "0",
    String(delivery.processingFeeApplicableAmount ?? ""),
    String(delivery.processingFeeOverrideAmount ?? ""),
    delivery.processingFeeWaived ? "1" : "0",
    delivery.deliveryFeeStatus ?? "not_set",
    String(delivery.deliveryFeeQuotedAmount ?? ""),
    delivery.deliveryFeeWaived ? "1" : "0",
  ].join("|");
}

export type FulfilmentTruth = {
  method: StorefrontOrderFulfilmentMethod | OwnerCreateFulfilmentMethod;
  pickupDate: string;
  pickupTime: string;
  delivery: StorefrontOrderDelivery | null;
};

/** Normalized fulfilment comparison for confirmation invalidation. */
export function fulfilmentMateriallyDiffer(
  before: FulfilmentTruth,
  after: FulfilmentTruth,
): boolean {
  const beforeMethod =
    before.method === "delivery" ? "delivery" : "pickup";
  const afterMethod = after.method === "delivery" ? "delivery" : "pickup";
  // Owner Workspace only Pickup|Delivery; drive_through treated as non-delivery.
  if (beforeMethod !== afterMethod) return true;
  if (trimRequired(before.pickupDate) !== trimRequired(after.pickupDate)) {
    return true;
  }
  if (
    normalizeTimeForCompare(before.pickupTime) !==
    normalizeTimeForCompare(after.pickupTime)
  ) {
    return true;
  }
  if (afterMethod !== "delivery") {
    return false;
  }
  return (
    serializeDeliveryForConfirmation(before.delivery) !==
    serializeDeliveryForConfirmation(after.delivery)
  );
}

/** Compact timeline metadata (no gratuitous PII dump). */
export function fulfilmentTimelineSummary(input: FulfilmentTruth): {
  method: "pickup" | "delivery";
  date: string;
  time: string;
  delivery: null | {
    recipient_name: string;
    recipient_phone: string;
    address_line_1: string;
    address_line_2: string | null;
    postcode: string;
    city: string;
    state: string;
    recipient_notify_preference: RecipientNotifyPreference;
  };
} {
  const method = input.method === "delivery" ? "delivery" : "pickup";
  return {
    method,
    date: trimRequired(input.pickupDate),
    time: normalizeTimeForCompare(input.pickupTime),
    delivery:
      method === "delivery" && input.delivery
        ? {
            recipient_name: trimRequired(input.delivery.recipientName),
            recipient_phone: trimRequired(input.delivery.recipientPhone),
            address_line_1: trimRequired(input.delivery.addressLine1),
            address_line_2: trimOptionalNull(input.delivery.addressLine2),
            postcode: trimRequired(input.delivery.postcode),
            city: trimRequired(input.delivery.city),
            state: trimRequired(input.delivery.state),
            recipient_notify_preference:
              input.delivery.recipientNotifyPreference,
          }
        : null,
  };
}

/** Seed Workspace edit Delivery draft from persisted order truth. */
export function deliveryDraftFromPersistedOrder(input: {
  customerName: string;
  customerPhone: string;
  fulfilmentMethod: StorefrontOrderFulfilmentMethod;
  delivery: StorefrontOrderDelivery | null;
}): DeliveryCreateDraft {
  const method = normalizeOwnerCreateFulfilmentMethod(input.fulfilmentMethod);
  if (method !== "delivery" || !input.delivery) {
    return defaultDeliveryCreateDraft();
  }
  const sameAsCustomer = isDeliveryRecipientSameAsOrderingCustomer({
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    delivery: input.delivery,
  });
  return {
    recipientName: input.delivery.recipientName,
    recipientPhone: input.delivery.recipientPhone,
    addressLine1: input.delivery.addressLine1,
    addressLine2: input.delivery.addressLine2 ?? "",
    postcode: input.delivery.postcode,
    city: input.delivery.city,
    state: input.delivery.state,
    recipientNotifyPreference: sameAsCustomer
      ? "inform_recipient"
      : input.delivery.recipientNotifyPreference,
    sameAsCustomer,
  };
}

/** Compact human-readable Delivery address lines (Confirmation / Quick View). */
export function formatDeliveryAddressLines(
  delivery: StorefrontOrderDelivery,
): string[] {
  const lines: string[] = [trimRequired(delivery.addressLine1)];
  const line2 = trimOptionalNull(delivery.addressLine2);
  if (line2) lines.push(line2);
  lines.push(
    `${trimRequired(delivery.postcode)} ${trimRequired(delivery.city)}`.trim(),
  );
  lines.push(trimRequired(delivery.state));
  return lines.filter((line) => line.length > 0);
}

/**
 * Owner Quick View fulfilment summary (Slice 4).
 * Pickup keeps a single schedule line; Delivery adds recipient/address/notify.
 */
export type QuickViewFulfilmentSummary = {
  methodLabel: "Pickup" | "Delivery";
  isDelivery: boolean;
  recipientSameAsCustomer: boolean;
  recipientName: string | null;
  recipientPhone: string | null;
  addressLines: string[];
  /** Null when Pickup, missing delivery, or same-person Delivery. */
  notifyLabel: string | null;
};

export function buildQuickViewFulfilmentSummary(order: {
  fulfilmentMethod: StorefrontOrderFulfilmentMethod;
  delivery: StorefrontOrderDelivery | null;
  customerName: string;
  phone: string;
}): QuickViewFulfilmentSummary {
  const view = buildWorkspaceFulfilmentViewModel(order);
  if (!view.isDelivery || !view.delivery) {
    return {
      methodLabel: "Pickup",
      isDelivery: false,
      recipientSameAsCustomer: false,
      recipientName: null,
      recipientPhone: null,
      addressLines: [],
      notifyLabel: null,
    };
  }
  return {
    methodLabel: "Delivery",
    isDelivery: true,
    recipientSameAsCustomer: view.recipientSameAsCustomer,
    recipientName: view.delivery.recipientName,
    recipientPhone: view.delivery.recipientPhone,
    addressLines: formatDeliveryAddressLines(view.delivery),
    notifyLabel: view.notifyLabel,
  };
}

/**
 * Pickup Crew formatter path (not Delivery).
 * Delivery uses the Delivery Crew formatter (M4-P4).
 */
export function isPickupCrewMessageAvailable(
  fulfilmentMethod: StorefrontOrderFulfilmentMethod | null | undefined,
): boolean {
  return (
    fulfilmentMethod !== "delivery" && fulfilmentMethod !== "dine_in"
  );
}

export type CustomerWebsiteFulfilmentMethod = "pickup" | "dine_in" | "delivery";

export function parseCustomerWebsiteFulfilmentMethod(
  value: string | null | undefined,
): CustomerWebsiteFulfilmentMethod {
  if (value === "dine_in" || value === "delivery") return value;
  return "pickup";
}

export function mapOrderDineInReservation(
  row:
    | {
        reservation_date?: string | null;
        reservation_time?: string | null;
        venue?: string | null;
        guest_count?: number | string | null;
        reservation_note?: string | null;
        status?: string | null;
      }
    | null
    | undefined,
): StorefrontOrderDineInReservation | null {
  if (!row) return null;
  const guestCount = Number(row.guest_count);
  if (!Number.isInteger(guestCount) || guestCount < 1) return null;
  const reservationDate = String(row.reservation_date ?? "").slice(0, 10);
  const reservationTime = String(row.reservation_time ?? "").slice(0, 5);
  const venueRaw = String(row.venue ?? "").trim().toLowerCase();
  const venue = venueRaw === "hyphen" || venueRaw === "whitebird" ? venueRaw : null;
  if (!reservationDate || !reservationTime || !venue) return null;
  const note = String(row.reservation_note ?? "").trim();
  return {
    reservationDate,
    reservationTime,
    venue,
    guestCount,
    reservationNote: note.length > 0 ? note : null,
    status: String(row.status ?? "pending") || "pending",
  };
}

/**
 * Crew Order Message is available for Pickup and Delivery.
 * null / unknown / drive_through keep historical Pickup formatter availability.
 */
export function isCrewOrderMessageAvailable(
  _fulfilmentMethod?: StorefrontOrderFulfilmentMethod | null,
): boolean {
  return true;
}

/** @deprecated M4-P4 ungated Delivery Crew — always available. */
export function pickupCrewUnavailableReason(
  _fulfilmentMethod?: StorefrontOrderFulfilmentMethod | null,
): string | null {
  return null;
}
