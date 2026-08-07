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

/** Owner-facing guest preorder (orders.customer_id is null). */
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
  status: "submitted" | "pending_confirmation";
  createdAt: string;
  items: StorefrontOrderItem[];
};

export type StorefrontOrderListItem = {
  id: string;
  orderNumber: string;
  customerName: string;
  cakeName: string;
  sizeLabel: string;
  pickupDate: string;
  pickupTime: string;
  status: "submitted" | "pending_confirmation";
  createdAt: string;
};
