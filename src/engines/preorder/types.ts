/** YYYY-MM-DD calendar date in the Whitebird business calendar. */
export type Ymd = string;

export const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";
export const DEFAULT_PREORDER_ROLLOVER_TIME = "00:00:00";
/** Empty-cart Whole Cake floor. Not an independent per-size rule. */
export const DEFAULT_CUSTOMER_PREORDER_DAYS = 2;

export type PreorderBusinessClock = {
  timezone: typeof MALAYSIA_TIME_ZONE;
  rolloverTime: string;
};

export const DEFAULT_MALAYSIA_PREORDER_CLOCK: PreorderBusinessClock = {
  timezone: MALAYSIA_TIME_ZONE,
  rolloverTime: DEFAULT_PREORDER_ROLLOVER_TIME,
};

export type PreorderCartLine = {
  lineId: string;
  cakeId: string;
  cakeSizeId: string;
  cakeName: string;
  sizeLabel: string;
  quantity: number;
  /** UX/display only on the client. Server reloads live DB value. */
  preorderDays: number;
};

export type CartEarliestResult = {
  earliestYmd: Ymd;
  blockingLineIds: string[];
};

export type CollectionDateCapacity = {
  fullyBooked: boolean;
  waitingListEnabled: boolean;
  /** Customer-facing cake names only. Never quantities. */
  blockingCakeNames?: string[];
  selectedYmd?: Ymd;
  nextAvailableYmd?: Ymd | null;
};

export type DateInvalidReason =
  | {
      code: "before_preorder";
      earliestYmd: Ymd;
      blockingLineIds: string[];
    }
  | { code: "operating_closed" }
  | { code: "orders_closed" }
  | { code: "not_in_catalogue" }
  | {
      code: "fully_booked";
      waitingListOffered: boolean;
      blockingCakeNames: string[];
      selectedYmd: Ymd;
      nextAvailableYmd: Ymd | null;
    }
  | { code: "ok" };

export type CollectionDateEvaluation = {
  valid: boolean;
  earliestYmd: Ymd;
  blockingLineIds: string[];
  reason: DateInvalidReason;
};

export const FULLY_BOOKED_CUSTOMER_LABEL = "Fully Booked";
export const JOIN_WAITING_LIST_CUSTOMER_LABEL = "Join Waiting List";
