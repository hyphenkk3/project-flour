/**
 * M5-P1 — slim Bakery production read model (not Owner Order Workspace DTO).
 */

import type {
  GuestOrderStatus,
  StorefrontOrderFulfilmentMethod,
} from "@/types/storefront";

/** P1 production presentation — no In Production until M5-P2 Start. */
export type BakeryProductionPresentation = "not_started" | "ready";

export type BakeryCakeLine = {
  id: string;
  cakeName: string;
  sizeLabel: string;
  quantity: number;
};

export type BakeryComplimentaryLine = {
  id: string;
  name: string;
  quantity: number;
  sortOrder: number;
};

export type BakeryPaidAddonMessage = {
  cardIndex: number;
  writtenMessage: string | null;
};

export type BakeryPaidAddonLine = {
  id: string;
  code: string;
  name: string;
  quantity: number;
  sortOrder: number;
  messages: BakeryPaidAddonMessage[];
};

/** Board card + shared identity for list rows. */
export type BakeryBoardOrder = {
  id: string;
  orderNumber: string;
  guestName: string;
  pickupDate: string;
  pickupTime: string;
  fulfilmentMethod: StorefrontOrderFulfilmentMethod;
  status: GuestOrderStatus;
  customerNotes: string | null;
  needsBakeryAttention: boolean;
  bakeryAttentionNote: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  outForDeliveryAt: string | null;
  includeReceipt: boolean;
  cakeLines: BakeryCakeLine[];
  complimentaryItems: BakeryComplimentaryLine[];
  paidAddons: BakeryPaidAddonLine[];
};

/** Detail adds nothing structural beyond board row; packing derived in helpers. */
export type BakeryOrderDetail = BakeryBoardOrder;

export type BakeryPackingReminderItem = {
  key: string;
  label: string;
};
