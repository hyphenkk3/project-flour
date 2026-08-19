/**
 * Calendar fulfilment presentation (M4-P2 Slice 5 — Product-accepted).
 * PRESENTATION ONLY — never feeds Matrix/Cakes counts, finance, or lifecycle.
 *
 * Derives from stored/normalized fulfilment_method only — never customer name text.
 * Status colour stays on the customer name independently of this background.
 */

/**
 * Pale warm yellow / beige — Whitebird operational Delivery convention.
 * Reuses `--color-status-warning-soft` (`#ffefd9`); presentation only.
 * Distinct from status-info (Today chrome / Dine-in fill).
 */
export const CALENDAR_FULFILMENT_DELIVERY_BG_CLASS = "bg-status-warning-soft";

/**
 * Pale blue — Whitebird operational Dine-in convention (Jotform / spreadsheet).
 * Reuses `--color-status-info-soft` (`#e0effc`); presentation only.
 */
export const CALENDAR_FULFILMENT_DINE_IN_BG_CLASS = "bg-status-info-soft";

/**
 * Identity-line chrome: intentional small highlighted block (not a tight text wash).
 * Product-accepted: `inline-block rounded-sm px-1 py-0.5`.
 */
export const CALENDAR_FULFILMENT_DELIVERY_LINE_CHROME_CLASS =
  "inline-block rounded-sm px-1 py-0.5";

/**
 * Returns Tailwind background classes for a Calendar identity line.
 * `delivery` and `dine_in` receive fills; pickup and unknown stay baseline.
 */
export function calendarFulfilmentBackgroundClass(
  fulfilmentMethod: string | null | undefined,
): string {
  if (fulfilmentMethod === "delivery") {
    return [
      CALENDAR_FULFILMENT_DELIVERY_BG_CLASS,
      CALENDAR_FULFILMENT_DELIVERY_LINE_CHROME_CLASS,
    ].join(" ");
  }
  if (fulfilmentMethod === "dine_in") {
    return [
      CALENDAR_FULFILMENT_DINE_IN_BG_CLASS,
      CALENDAR_FULFILMENT_DELIVERY_LINE_CHROME_CLASS,
    ].join(" ");
  }
  return "";
}

/** True when Calendar should paint Delivery soft background. */
export function isCalendarDeliveryFulfilmentPresentation(
  fulfilmentMethod: string | null | undefined,
): boolean {
  return fulfilmentMethod === "delivery";
}
