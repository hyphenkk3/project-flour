export type GuestOrderStatus =
  | "submitted"
  | "pending_confirmation"
  | "awaiting_payment";

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
  items: StorefrontOrderItem[];
  complimentaryItems: StorefrontComplimentaryItem[];
  total: number;
};

export type StorefrontOrderListItem = {
  id: string;
  orderNumber: string;
  customerName: string;
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
  | "customer_confirmed";

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
