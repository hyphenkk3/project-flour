export type GuestOrderStatus =
  | "submitted"
  | "pending_confirmation"
  | "awaiting_payment"
  | "paid";

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
  | "whatsapp"
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

export type StorefrontOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  email: string;
  pickupDate: string;
  pickupTime: string;
  notes: string | null;
  internalNotes: string | null;
  status: GuestOrderStatus;
  createdAt: string;
  confirmationNeedsResend: boolean;
  collectionId: string | null;
  orderSource: OrderSource;
  paymentDeadlineAt: string | null;
  paymentRequestSentAt: string | null;
  rm10CardIssuanceSuppressed: boolean;
  rm10CardIssuanceSuppressionCode: Rm10IssuanceSuppressionCode | null;
  items: StorefrontOrderItem[];
  complimentaryItems: StorefrontComplimentaryItem[];
  /** Item subtotal (price snapshots). Prefer settlement.amountDue for payable. */
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
  | "discount_changed";

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
  total: number;
};
