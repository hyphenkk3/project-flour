import type { WaitingListConfirmationStaffLink } from "@/engines/waiting-list/confirmation-review";
import type {
  WaitingListItemStatus,
  WaitingListRequestStatus,
} from "@/engines/waiting-list/types";

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
  requestStatus: WaitingListRequestStatus | string;
  openToAlternatives: boolean;
  notes: string | null;
  contactedAt: string | null;
  responseDeadlineAt: string | null;
  convertedOrderId: string | null;
  convertedOrderNumber: string | null;
  actionRequired: boolean;
  offeredQuantity: number | null;
  requestItems: Array<{
    itemId: string;
    cakeName: string;
    sizeLabel: string;
    quantity: number;
    status: WaitingListItemStatus;
    offeredQuantity: number | null;
  }>;
  confirmationLink: WaitingListConfirmationStaffLink | null;
};

export type WaitingListCrmCustomerOption = {
  id: string;
  fullName: string;
  phoneNumber: string | null;
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

export type HomeWaitingListAttentionPreview = {
  requestId: string;
  guestName: string;
  line: string;
  href: string;
};

export type HomeWaitingListAttention = {
  count: number;
  href: string;
  preview: HomeWaitingListAttentionPreview | null;
};
