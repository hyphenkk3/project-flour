/**
 * Cake-production quantity helpers for Calendar Matrix / Cakes view.
 * Intentionally cake-lines only — paid add-ons must never contribute.
 */

import type {
  CalendarCakeItem,
  CalendarEntry,
} from "@/workspaces/owner/calendar/types";

/** Sum cake line quantities (order_items snapshots only). */
export function totalCakeQuantityFromItems(
  items: Array<Pick<CalendarCakeItem, "quantity">>,
): number {
  return items.reduce(
    (sum, item) => sum + Math.max(1, Number(item.quantity) || 1),
    0,
  );
}

/** Sum cake production quantity across Calendar entries (Matrix/Cakes source). */
export function totalCakeQuantityFromCalendarEntries(
  entries: Array<Pick<CalendarEntry, "items">>,
): number {
  return entries.reduce(
    (sum, entry) => sum + totalCakeQuantityFromItems(entry.items),
    0,
  );
}

/**
 * Expand Calendar entries into cake lines for Cakes view.
 * Paid add-ons are not part of CalendarEntry.items and cannot appear here.
 */
export function cakeLinesFromCalendarEntries(
  entries: CalendarEntry[],
): Array<{
  orderId: string;
  cakeName: string;
  sizeLabel: string;
  quantity: number;
}> {
  const lines: Array<{
    orderId: string;
    cakeName: string;
    sizeLabel: string;
    quantity: number;
  }> = [];
  for (const entry of entries) {
    for (const item of entry.items) {
      lines.push({
        orderId: entry.id,
        cakeName: item.cakeName,
        sizeLabel: item.sizeLabel,
        quantity: Math.max(1, Number(item.quantity) || 1),
      });
    }
  }
  return lines;
}
