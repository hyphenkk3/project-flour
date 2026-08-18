/**
 * EXTRA v1.1 — which extra_stock rows appear on Whole Cake Calendar.
 *
 * Calendar placement uses an inclusive validity range:
 * - Confirmed with pickup window: pickup_available_from_at → pickup_through_at (dates)
 * - Proposed / no window: prepared_on only (single day)
 *
 * Rejected never active. Null prepared_on never invented.
 * Confirmed past pickup-through excluded from active planning display.
 */

import { isExtraAvailable } from "@/engines/extra/availability";
import type { ExtraLifecycle } from "@/engines/extra/availability";
import { toBusinessDateKey } from "@/lib/dates";

export type CalendarExtraMarker = {
  id: string;
  preparedOn: string;
  cakeName: string;
  sizeLabel: string;
  lifecycle: "proposed" | "confirmed";
  libraryCakeId: string | null;
  libraryCakeSizeId: string | null;
  pickupAvailableFromAt: string | null;
  pickupThroughAt: string | null;
  /** Inclusive first calendar day this EXTRA occupies on the Matrix. */
  validFromYmd: string;
  /** Inclusive last calendar day this EXTRA occupies on the Matrix. */
  validToYmd: string;
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

/** Inclusive calendar validity for one EXTRA marker (Singapore calendar dates). */
export function extraCalendarValidRange(input: {
  lifecycle: "proposed" | "confirmed";
  preparedOn: string;
  pickupAvailableFromAt: string | null;
  pickupThroughAt: string | null;
}): { validFromYmd: string; validToYmd: string } | null {
  const preparedOn = input.preparedOn.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(preparedOn)) return null;

  if (
    input.lifecycle === "confirmed" &&
    input.pickupAvailableFromAt &&
    input.pickupThroughAt
  ) {
    const validFromYmd = toBusinessDateKey(input.pickupAvailableFromAt);
    const validToYmd = toBusinessDateKey(input.pickupThroughAt);
    if (!validFromYmd || !validToYmd) {
      return { validFromYmd: preparedOn, validToYmd: preparedOn };
    }
    if (validFromYmd <= validToYmd) {
      return { validFromYmd, validToYmd };
    }
  }

  return { validFromYmd: preparedOn, validToYmd: preparedOn };
}

/** True when the EXTRA validity range overlaps a visible inclusive date window. */
export function extraCalendarRangeOverlaps(
  marker: Pick<CalendarExtraMarker, "validFromYmd" | "validToYmd">,
  fromYmd: string,
  toYmd: string,
): boolean {
  return marker.validFromYmd <= toYmd && marker.validToYmd >= fromYmd;
}

/** Clip an EXTRA range to visible Matrix columns; null when no overlap. */
export function clipExtraCalendarSpan(
  marker: CalendarExtraMarker,
  dateYmids: readonly string[],
): {
  extra: CalendarExtraMarker;
  startYmd: string;
  endYmd: string;
  startColumnIndex: number;
  columnSpan: number;
} | null {
  if (dateYmids.length === 0) return null;
  const visibleFrom = dateYmids[0]!;
  const visibleTo = dateYmids[dateYmids.length - 1]!;
  const startYmd =
    marker.validFromYmd > visibleFrom ? marker.validFromYmd : visibleFrom;
  const endYmd =
    marker.validToYmd < visibleTo ? marker.validToYmd : visibleTo;
  if (startYmd > endYmd) return null;

  const startColumnIndex = dateYmids.indexOf(startYmd);
  const endColumnIndex = dateYmids.indexOf(endYmd);
  if (startColumnIndex === -1 || endColumnIndex === -1) return null;

  return {
    extra: marker,
    startYmd,
    endYmd,
    startColumnIndex,
    columnSpan: endColumnIndex - startColumnIndex + 1,
  };
}

export function mapExtraStockRowToCalendarMarker(row: {
  id: string;
  cake_name: string;
  size_label: string;
  lifecycle: string;
  prepared_on: string | null;
  pickup_available_from_at: string | null;
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

  const range = extraCalendarValidRange({
    lifecycle: row.lifecycle,
    preparedOn: row.prepared_on,
    pickupAvailableFromAt: row.pickup_available_from_at,
    pickupThroughAt: row.pickup_through_at,
  });
  if (!range) return null;

  return {
    id: row.id,
    preparedOn: row.prepared_on,
    cakeName: row.cake_name.trim() || "Cake",
    sizeLabel: row.size_label.trim() || "Size",
    lifecycle: row.lifecycle,
    libraryCakeId: row.library_cake_id,
    libraryCakeSizeId: row.library_cake_size_id,
    pickupAvailableFromAt: row.pickup_available_from_at,
    pickupThroughAt: row.pickup_through_at,
    validFromYmd: range.validFromYmd,
    validToYmd: range.validToYmd,
  };
}
