export type GuestOrderStatus =
  | "submitted"
  | "pending_confirmation"
  | "awaiting_payment"
  | "paid";

/** Guest Owner fulfilment methods (DB also has drive_through). */
export type StorefrontOrderFulfilmentMethod =
  | "pickup"
  | "delivery"
  | "drive_through";

/** Explicit Delivery recipient-notify preference (not customer messaging consent). */
export type RecipientNotifyPreference =
  | "inform_recipient"
  | "do_not_inform_recipient";

/** M4-P3 fee exception request lifecycle (independent per charge category). */
export type DeliveryFeeRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

/** Pending/resolved Delivery Fee waiver request (independent of Processing). */
export type StorefrontDeliveryFeeRequest = {
  status: DeliveryFeeRequestStatus | null;
  reason: string | null;
  /** Quote amount snapshotted when the waiver was requested. */
  quotedAmount: number | null;
  requestedBy: string | null;
  requestedByName: string | null;
  requestedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

/** Pending/resolved Processing Fee waive/change request. */
export type StorefrontProcessingFeeRequest = {
  kind: "processing_override" | "processing_waiver" | null;
  status: DeliveryFeeRequestStatus | null;
  proposedAmount: number | null;
  reason: string | null;
  requestedBy: string | null;
  requestedByName: string | null;
  requestedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

/** Snapshotted Delivery details on a guest order (null when Pickup). */
export type StorefrontOrderDelivery = {
  recipientName: string;
  recipientPhone: string;
  addressLine1: string;
  addressLine2: string | null;
  postcode: string;
  city: string;
  state: string;
  recipientNotifyPreference: RecipientNotifyPreference;
  /** M4-P3: false for historical M4-P2 Delivery (no auto charges). */
  financeEnabled: boolean;
  processingFeeApplicableAmount: number | null;
  processingFeeOverrideAmount: number | null;
  processingFeeWaived: boolean;
  deliveryFeeStatus: "not_set" | "quoted" | "quoted_waived";
  deliveryFeeQuotedAmount: number | null;
  deliveryFeeWaived: boolean;
  /** Independent Delivery Fee waiver request slot (2B-1). */
  deliveryFeeRequest: StorefrontDeliveryFeeRequest;
  /** Independent Processing Fee request slot (2B-1). */
  processingFeeRequest: StorefrontProcessingFeeRequest;
};

export type PaymentMethodCode = "wb_qr" | "online_transfer" | "others";

export type OrderAdjustment = {
  id: string;
  orderId: string;
  kind: string;
  code: string | null;
  label: string;
  amount: number;
  reason: string | null;
  metadata: Record<string, unknown>;
  status: "active" | "reversed";
  reversesAdjustmentId: string | null;
  createdAt: string;
};

export type OrderSource =
  | "customer_website"
  | "jotform"
  | "whatsapp"
  | "whitebird_instagram"
  | "wee"
  | "lex"
  | "walk_in"
  | "last_minute"
  | "other";

export type Rm10IssuanceSuppressionCode =
  | "august_promo_applied"
  | "rm10_voucher_redeemed";


export type OrderPaymentAllocationView = {
  id: string;
  paymentId: string;
  orderId: string;
  amount: number;
  paymentStatus: "verified";
  method: PaymentMethodCode;
  methodDescription: string | null;
  paidAt: string;
  referenceNote: string | null;
  verifiedBy: string;
  verifiedByName: string | null;
  verifiedAt: string;
  createdAt: string;
};

export type OrderRefundView = {
  id: string;
  orderId: string;
  paymentId: string | null;
  amount: number;
  reason: string | null;
  refundedAt: string;
  status: "recorded";
  createdAt: string;
};

export type OrderSettlement = {
  subtotal: number;
  totalAdjustments: number;
  amountDue: number;
  verifiedPaymentsAllocated: number;
  refundsTotal: number;
  netReceived: number;
  remainingBalance: number;
  overpayment: number;
  isFullyPaid: boolean;
};

export type StorefrontCollection = {
  id: string;
  name: string;
  month: string;
};

export type StorefrontCakeSize = {
  id: string;
  cakeId: string;
  size: string;
  price: number;
  sortOrder: number;
};

export type StorefrontCake = {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  sharingGuide: string | null;
  allergens: string[];
  sizes: StorefrontCakeSize[];
};

export type StorefrontOrderItem = {
  id: string;
  orderId: string;
  cakeId: string;
  cakeSizeId: string;
  quantity: number;
  unitPrice: number;
  cakeName: string;
  sizeLabel: string;
};

export type StorefrontComplimentaryItem = {
  id: string;
  name: string;
  quantity: number;
  sortOrder: number;
  complimentaryItemTypeId: string | null;
};

/** Catalog definition for a paid non-cake add-on (live price for NEW lines only). */
export type PaidAddonType = {
  id: string;
  code: string;
  name: string;
  unitPrice: number;
  financialShorthand: string;
  isActive: boolean;
  sortOrder: number;
  /** Maximum selectable quantity per order line (P1 cards = 3). */
  maxQuantity: number;
};

/** Optional written message for one physical card within a commercial line. */
export type StorefrontPaidAddonMessage = {
  cardIndex: number;
  writtenMessage: string | null;
};

/** Snapshotted paid-add-on commercial line on an order. */
export type StorefrontPaidAddon = {
  id: string;
  orderId: string;
  paidAddonTypeId: string | null;
  code: string;
  name: string;
  unitPrice: number;
  financialShorthand: string;
  quantity: number;
  /**
   * @deprecated Prefer `messages` (per physical card). Legacy single-message
   * field may appear on historical reads before backfill; treat as Card 1.
   */
  writtenMessage: string | null;
  /** Per-physical-card messages; length conceptually = quantity (nulls allowed). */
  messages: StorefrontPaidAddonMessage[];
  sortOrder: number;
};

export type StorefrontOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  /** WhatsApp phone. May be blank for Owner-created guest orders; website submit still requires it. */
  phone: string;
  email: string;
  /**
   * Fulfilment schedule date (DB column pickup_date).
   * Used for both Pickup and Delivery — contextual UI labels in later slices.
   */
  pickupDate: string;
  /**
   * Fulfilment schedule time (DB column pickup_time).
   * Used for both Pickup and Delivery — contextual UI labels in later slices.
   */
  pickupTime: string;
  /** Optional human-facing pickup wording; pickupTime remains the sortable clock time. */
  pickupInstruction: string | null;
  /** DB fulfilment_method. Historical / missing maps to pickup in readers. */
  fulfilmentMethod: StorefrontOrderFulfilmentMethod;
  /** Snapshotted Delivery details; null for Pickup (and when no details row). */
  delivery: StorefrontOrderDelivery | null;
  notes: string | null;
  internalNotes: string | null;
  status: GuestOrderStatus;
  createdAt: string;
  confirmationNeedsResend: boolean;
  collectionId: string | null;
  orderSource: OrderSource;
  /** Crew Order flag — not an order source. Display precedence later: (crew) over source suffix. */
  crewOrder: boolean;
  /** Physical purchase receipt with cake at pickup. Independent of email submission preference. */
  includeReceipt: boolean;
  needsBakeryAttention: boolean;
  bakeryAttentionNote: string | null;
  readyAt: string | null;
  readyBy: string | null;
  pickedUpAt: string | null;
  pickedUpBy: string | null;
  outForDeliveryAt: string | null;
  outForDeliveryBy: string | null;
  deliveredAt: string | null;
  deliveredBy: string | null;
  paymentDeadlineAt: string | null;
  paymentRequestSentAt: string | null;
  rm10CardIssuanceSuppressed: boolean;
  rm10CardIssuanceSuppressionCode: Rm10IssuanceSuppressionCode | null;
  items: StorefrontOrderItem[];
  /** Snapshotted paid add-ons; normalize missing/legacy to []. */
  paidAddons: StorefrontPaidAddon[];
  complimentaryItems: StorefrontComplimentaryItem[];
  /**
   * Commercial subtotal (cake snapshots + paid-add-on snapshots) before adjustments.
   * Prefer settlement.amountDue for payable.
   */
  total: number;
  adjustments: OrderAdjustment[];
  paymentAllocations: OrderPaymentAllocationView[];
  refunds: OrderRefundView[];
  settlement: OrderSettlement;
};

export type StorefrontOrderListItem = {
  id: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  cakeName: string;
  sizeLabel: string;
  additionalItemCount: number;
  pickupDate: string;
  pickupTime: string;
  status: GuestOrderStatus;
  createdAt: string;
  confirmationNeedsResend: boolean;
  orderSource: OrderSource;
  fulfilmentMethod: StorefrontOrderFulfilmentMethod;
  readyAt: string | null;
  pickedUpAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  /** Already selected on board query — enables overdue attention without N+1. */
  paymentDeadlineAt: string | null;
  /** Pending delivery/processing fee request from nested delivery row. */
  hasPendingFeeRequest: boolean;
};

export type OrderTimelineEventType =
  | "preorder_submitted"
  | "order_updated"
  | "confirmation_prepared"
  | "confirmation_marked_sent"
  | "confirmation_outdated"
  | "updated_confirmation_prepared"
  | "updated_confirmation_marked_sent"
  | "customer_confirmed"
  | "payment_request_prepared"
  | "payment_request_marked_sent"
  | "payment_deadline_extended"
  | "payment_recorded"
  | "payment_secured"
  | "august_promo_applied"
  | "rm10_voucher_redeemed"
  | "rm10_voucher_owner_override"
  | "discount_removed"
  | "discount_changed"
  | "order_production_started"
  | "order_production_start_undone"
  | "order_marked_ready"
  | "order_ready_undone"
  | "order_picked_up"
  | "order_picked_up_undone"
  | "order_out_for_delivery"
  | "order_out_for_delivery_undone"
  | "order_delivered"
  | "order_delivered_undone"
  | "staff_preorder_created"
  | "operations_approval_requested"
  | "operations_approval_approved"
  | "operations_approval_rejected"
  | "operations_approval_cancelled";

export type OrderTimelineEvent = {
  id: string;
  orderId: string;
  eventType: OrderTimelineEventType | string;
  actorStaffId: string | null;
  actorName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ConfirmationSnapshot = {
  id: string;
  orderId: string;
  version: number;
  lifecycleStatus: "sent" | "outdated";
  messageBody: string;
  snapshotPayload: ConfirmationPayload;
  preparedBy: string | null;
  preparedAt: string | null;
  sentBy: string | null;
  sentAt: string | null;
  outdatedAt: string | null;
  createdAt: string;
};

export type ConfirmationPayload = {
  staffCustomerFacingName: string;
  customerName: string;
  customerPhone: string;
  pickupDate: string;
  pickupTime: string;
  /**
   * Optional for historical Pickup snapshots (missing → render as Pickup).
   * Explicit `delivery` must not be falsified to Pickup merely because
   * optional Delivery detail fields are incomplete.
   */
  fulfilmentMethod?: StorefrontOrderFulfilmentMethod;
  /**
   * Snapshotted Delivery sibling truth (M4-P2). Optional for historical
   * Pickup snapshots. Present on Delivery confirmations so sent bodies
   * remain reproducible from payload without live-order drift.
   */
  delivery?: StorefrontOrderDelivery | null;
  items: Array<{
    cakeName: string;
    sizeLabel: string;
    quantity: number;
    unitPrice: number;
  }>;
  complimentaryItems: Array<{
    name: string;
    quantity: number;
  }>;
  /**
   * Snapshotted paid add-ons for equation + Whole Cake commercial lines +
   * per-card Special Request messages. Optional for historical snapshots;
   * readers treat missing as []. Uses order snapshots — never live catalog.
   */
  paidAddons?: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    financialShorthand: string;
    /** @deprecated Prefer messages[]. Legacy single message → Card 1. */
    writtenMessage?: string | null;
    /** Per-physical-card optional messages. */
    messages?: Array<{
      cardIndex: number;
      writtenMessage: string | null;
    }>;
  }>;
  /**
   * Payable total stored on snapshots.
   * After pre-confirmation pricing correction this equals amountDue.
   * Historical snapshots may equal item subtotal only.
   */
  total: number;
  /** Commercial subtotal before adjustments (cakes + paid add-ons when present). */
  subtotal?: number;
  /** Effective customer-facing adjustments (when present). */
  adjustments?: Array<{
    label: string;
    amount: number;
    /** Structured adjustment code (e.g. august_promo_2026, rm10_physical_card). */
    code?: string | null;
    /** Structured adjustment metadata (e.g. RM10 voucher_number). */
    metadata?: Record<string, unknown>;
  }>;
  /** Authoritative settlement amount due (when present). */
  amountDue?: number;
};
