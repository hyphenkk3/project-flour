export type OrderStatus =
  | "submitted"
  | "pending_confirmation"
  | "confirmed"
  | "awaiting_payment"
  | "paid"
  | "cancelled"
  | "completed";

export type PaymentStatus = "unpaid" | "paid" | "refunded";

export type FulfilmentMethod = "pickup" | "delivery" | "drive_through";

export type Order = {
  id: string;
  orderNumber: string;
  customerId: string;
  fulfilmentMethod: FulfilmentMethod;
  pickupDate: string;
  pickupTime: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  internalNotes: string | null;
  customerNotes: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderCustomerSummary = {
  id: string;
  fullName: string;
  phoneNumber: string | null;
};

export type OrderListItem = Order & {
  customer: OrderCustomerSummary;
};

export type OrderDetail = OrderListItem & {
  createdByName: string | null;
  updatedByName: string | null;
};

export type OrderInput = {
  customerId: string;
  fulfilmentMethod: FulfilmentMethod;
  pickupDate: string;
  pickupTime: string;
  internalNotes: string | null;
  customerNotes: string | null;
};
