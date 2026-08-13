/**
 * EXTRA v1.1 — which extra_stock rows appear on Whole Cake Calendar.
 *
 * Placement date = prepared_on only (never proposed_at / pickup_through_at).
 * Rejected never active. Null prepared_on never invented.
 * Confirmed past pickup-through excluded from active planning display.
 */

import { isExtraAvailable } from "@/engines/extra/availability";
import type { ExtraLifecycle } from "@/engines/extra/availability";

export type CalendarExtraMarker = {
  id: string;
  preparedOn: string;
  cakeName: string;
  sizeLabel: string;
  lifecycle: "proposed" | "confirmed";
  libraryCakeId: string | null;
  libraryCakeSizeId: string | null;
  pickupThroughAt: string | null;
};

export function isExtraActiveOnCalendar(input: {
  lifecycle: ExtraLifecycle;
  preparedOn: string | null;
  pickupThroughAt: string | null;
  now?: Date;
}): boolean {
  if (!input.preparedOn?.trim()) return false;
  if (input.lifecycle === "rejected") return false;
  if (input.lifecycle === "proposed") return true;
  if (input.lifecycle !== "confirmed") return false;
  // Confirmed without cutoff still shows (Bakery may not have set through yet
  // only on confirm path — confirm requires pickup_through, so this is rare).
  if (!input.pickupThroughAt) return true;
  return isExtraAvailable({
    lifecycle: "confirmed",
    pickupThroughAt: input.pickupThroughAt,
    now: input.now,
  });
}

export function mapExtraStockRowToCalendarMarker(row: {
  id: string;
  cake_name: string;
  size_label: string;
  lifecycle: string;
  prepared_on: string | null;
  pickup_through_at: string | null;
  library_cake_id: string | null;
  library_cake_size_id: string | null;
}): CalendarExtraMarker | null {
  if (
    !isExtraActiveOnCalendar({
      lifecycle: row.lifecycle as ExtraLifecycle,
      preparedOn: row.prepared_on,
      pickupThroughAt: row.pickup_through_at,
    })
  ) {
    return null;
  }
  if (row.lifecycle !== "proposed" && row.lifecycle !== "confirmed") {
    return null;
  }
  if (!row.prepared_on) return null;
  return {
    id: row.id,
    preparedOn: row.prepared_on,
    cakeName: row.cake_name.trim() || "Cake",
    sizeLabel: row.size_label.trim() || "Size",
    lifecycle: row.lifecycle,
    libraryCakeId: row.library_cake_id,
    libraryCakeSizeId: row.library_cake_size_id,
    pickupThroughAt: row.pickup_through_at,
  };
}
