/**
 * Calendar fulfilment presentation (M4-P2 Slice 5 — Product-accepted).
 * PRESENTATION ONLY — never feeds Matrix/Cakes counts, finance, or lifecycle.
 *
 * Derives from stored/normalized fulfilment_method only — never customer name text.
 * Future Dine-In can extend this map without Calendar component rewrites.
 */

/**
 * Soft teal wash from brand `--color-signal` (`bg-signal-soft` in globals).
 * Product-accepted Visual Trial 2 (`#b8d4cf`).
 * Distinct from status-info (Today) / status-warning / status-progress.
 */
export const CALENDAR_FULFILMENT_DELIVERY_BG_CLASS = "bg-signal-soft";

/**
 * Identity-line chrome: intentional small highlighted block (not a tight text wash).
 * Product-accepted: `inline-block rounded-sm px-1 py-0.5`.
 */
export const CALENDAR_FULFILMENT_DELIVERY_LINE_CHROME_CLASS =
  "inline-block rounded-sm px-1 py-0.5";

/**
 * Returns Tailwind background classes for a Calendar identity line.
 * Only `delivery` receives a non-empty background; all else → baseline.
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
  return "";
}

/** True when Calendar should paint Delivery soft background. */
export function isCalendarDeliveryFulfilmentPresentation(
  fulfilmentMethod: string | null | undefined,
): boolean {
  return fulfilmentMethod === "delivery";
}
