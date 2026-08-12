import type {
  GuestOrderStatus,
  StorefrontOrderFulfilmentMethod,
} from "@/types/storefront";

/**
 * Slim Whole Cake Calendar read model.
 * `kind` is reserved so future EXTRA operational rows can normalize here
 * without treating EXTRA as a financial order.
 */
export type CalendarEntryKind = "order";

/** Snapshot cake line for Cake View — from order_items, not Library/Collection. */
export type CalendarCakeItem = {
  id: string;
  cakeName: string;
  sizeLabel: string;
  quantity: number;
};

export type CalendarEntry = {
  kind: CalendarEntryKind;
  /** Order id while kind === "order". */
  id: string;
  pickupDate: string;
  /** Sortable HH:MM:SS (or HH:MM) from orders.pickup_time. */
  pickupTime: string;
  /**
   * Lightweight fulfilment truth for Calendar presentation only.
   * Shared schedule remains pickup_date / pickup_time.
   * Missing/unknown normalize to pickup at map time.
   */
  fulfilmentMethod: StorefrontOrderFulfilmentMethod;
  /** Raw customer name for deterministic tie-break sorting. */
  customerName: string;
  /** Display name including source/crew suffix. */
  displayName: string;
  status: GuestOrderStatus;
  needsBakeryAttention: boolean;
  /** Effective rm10_physical_card only (reversed rows do not count). */
  hasEffectiveRm10: boolean;
  /** Operational Ready timestamp — independent of financial status. */
  readyAt: string | null;
  /** Pickup Picked Up timestamp — independent of financial status. Ignored for Delivery markers. */
  pickedUpAt: string | null;
  /** Delivery Out for Delivery timestamp — independent of financial status. */
  outForDeliveryAt: string | null;
  /** Delivery Delivered timestamp — independent of financial status. */
  deliveredAt: string | null;
  /** Snapshot items in deterministic display order for Cake View. */
  items: CalendarCakeItem[];
};

export type CalendarViewMode = "matrix" | "cakes" | "orders";

export type CalendarMatrixMode = "customers" | "totals";

export const DEFAULT_CALENDAR_VIEW: CalendarViewMode = "matrix";

export const DEFAULT_CALENDAR_MATRIX_MODE: CalendarMatrixMode = "customers";

export function isCalendarViewMode(
  value: string | undefined,
): value is CalendarViewMode {
  return value === "matrix" || value === "cakes" || value === "orders";
}

export function isCalendarMatrixMode(
  value: string | undefined,
): value is CalendarMatrixMode {
  return value === "customers" || value === "totals";
}
