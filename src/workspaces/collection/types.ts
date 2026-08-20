/**
 * Live Collection — slim desk read model (guest Pickup Ready handoff).
 */

import type {
  GuestOrderStatus,
  StorefrontOrderFulfilmentMethod,
} from "@/types/storefront";

export type CollectionCakeLine = {
  id: string;
  cakeName: string;
  sizeLabel: string;
  quantity: number;
};

export type CollectionComplimentaryLine = {
  id: string;
  name: string;
  quantity: number;
  sortOrder: number;
};

export type CollectionPaidAddonMessage = {
  cardIndex: number;
  writtenMessage: string | null;
};

export type CollectionPaidAddonLine = {
  id: string;
  code: string;
  name: string;
  quantity: number;
  sortOrder: number;
  messages: CollectionPaidAddonMessage[];
};

export type CollectionDineInReservation = {
  reservationDate: string;
  reservationTime: string;
  venue: "hyphen" | "whitebird";
  guestCount: number;
  reservationNote: string | null;
};

export type CollectionBoardOrder = {
  id: string;
  orderNumber: string;
  guestName: string;
  guestPhone: string | null;
  pickupDate: string;
  pickupTime: string;
  fulfilmentMethod: StorefrontOrderFulfilmentMethod;
  status: GuestOrderStatus;
  customerNotes: string | null;
  productionStartedAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  includeReceipt: boolean;
  dineIn: CollectionDineInReservation | null;
  cakeLines: CollectionCakeLine[];
  complimentaryItems: CollectionComplimentaryLine[];
  paidAddons: CollectionPaidAddonLine[];
};

export type CollectionPackingReminderItem = {
  key: string;
  label: string;
};
