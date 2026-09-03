import type { WaitingListItemStatus } from "@/engines/waiting-list/types";

export type WaitingListBoardRow = {
  itemId: string;
  requestId: string;
  guestName: string;
  guestPhone: string;
  cakeId: string;
  cakeName: string;
  sizeId: string | null;
  sizeLabel: string;
  quantity: number;
  remainingQuantity: number;
  pickupDate: string;
  queuePosition: number;
  joinedAt: string;
  status: WaitingListItemStatus;
  openToAlternatives: boolean;
  contactedAt: string | null;
  responseDeadlineAt: string | null;
  convertedOrderId: string | null;
  convertedOrderNumber: string | null;
  actionRequired: boolean;
  offeredQuantity: number | null;
};

export type WaitingListCollectionSetting = {
  id: string;
  name: string;
  waitingListEnabled: boolean;
  waitingListResponseMinutes: number | null;
};

export type WaitingListCakeOption = {
  id: string;
  name: string;
  sizes: Array<{ id: string; label: string }>;
};
