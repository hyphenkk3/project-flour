/** Waiting-list domain. Separate from production capacity Fully Booked. */

export const WAITING_LIST_REQUEST_STATUSES = [
  "active",
  "partially_converted",
  "converted",
  "cancelled",
  "closed",
] as const;

export type WaitingListRequestStatus =
  (typeof WAITING_LIST_REQUEST_STATUSES)[number];

export const WAITING_LIST_ITEM_STATUSES = [
  "active",
  "contacted",
  "accepted",
  "partially_accepted",
  "declined",
  "expired",
  "cancelled",
  "converted",
  "closed",
] as const;

export type WaitingListItemStatus = (typeof WAITING_LIST_ITEM_STATUSES)[number];

/** Participate in the (date, cake, size) queue unique index. */
export const WAITING_LIST_QUEUE_STATUSES = [
  "active",
  "contacted",
  "partially_accepted",
] as const;

export type WaitingListQueueStatus =
  (typeof WAITING_LIST_QUEUE_STATUSES)[number];

export const WAITING_LIST_HOLD_STATUSES = [
  "active",
  "released",
  "converted",
  "expired",
] as const;

export type WaitingListHoldStatus = (typeof WAITING_LIST_HOLD_STATUSES)[number];

export const DEFAULT_WAITING_LIST_RESPONSE_MINUTES = 30;

export type WaitingListEventType =
  | "joined"
  | "manually_added"
  | "quantity_changed"
  | "product_changed"
  | "date_changed"
  | "contacted"
  | "response_deadline"
  | "accepted"
  | "declined"
  | "partially_fulfilled"
  | "remaining_kept"
  | "remaining_closed"
  | "alternative_offered"
  | "alternative_accepted"
  | "alternative_declined"
  | "cancelled"
  | "converted_to_order"
  | "capacity_action_required";

export type WaitingListQueueScope = {
  pickupDate: string;
  cakeId: string;
  sizeId: string | null;
};

export type WaitingListProductLine = {
  cakeId: string;
  sizeId: string | null;
  cakeName: string;
  sizeLabel: string;
  quantity: number;
};
