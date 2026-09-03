/**
 * Staff availability overview — read-only presentation of closures + capacity.
 *
 * Confirmed/committed quantity uses the Phase 5.3 floor status set.
 * Capacity rows are independent scopes (not additive). Most-specific matching
 * remains the Phase 3 SQL behaviour; this module does not invent precedence.
 *
 * No capacity row = unrestricted (never Fully Booked).
 * Capacity row exists = constrained.
 * committed >= capacity = Fully Booked.
 */

import { addBusinessCalendarDays, parseBusinessDate } from "@/lib/dates";
import {
  PRODUCTION_CAPACITY_FLOOR_ORDER_STATUSES,
  committedQuantityForCapacityScope,
  type ProductionCapacityScope,
} from "@/engines/orders/production-capacity";
import { closedPickupDateSet } from "@/engines/business-calendar/order-availability";

export const AVAILABILITY_OVERVIEW_DAY_COUNT = 14;

export const AVAILABILITY_OVERVIEW_FLOOR_ORDER_STATUSES =
  PRODUCTION_CAPACITY_FLOOR_ORDER_STATUSES;

export type AvailabilityOverviewScopeStatus = "open" | "fully_booked";

export type AvailabilityOverviewCapacityRow = {
  pickupDate: string;
  cakeId: string;
  cakeName: string;
  sizeId: string | null;
  sizeLabel: string | null;
  collectionId: string | null;
  collectionLabel: string | null;
  capacityQuantity: number;
  committedQuantity: number;
};

export type AvailabilityOverviewScopeView = {
  cakeId: string;
  cakeName: string;
  sizeId: string | null;
  sizeLabel: string | null;
  collectionId: string | null;
  collectionLabel: string | null;
  scopeLabel: string;
  capacityQuantity: number;
  committedQuantity: number;
  remainingQuantity: number;
  status: AvailabilityOverviewScopeStatus;
};

export type AvailabilityOverviewDay = {
  pickupDate: string;
  closed: boolean;
  unrestricted: boolean;
  scopes: AvailabilityOverviewScopeView[];
};

export type AvailabilityOverviewCommittedLine = {
  orderStatus: string;
  orderPickupDate: string;
  orderCollectionId: string | null;
  itemCakeId: string;
  itemSizeId: string | null;
  quantity: number;
};

export function parseAvailabilityOverviewFrom(
  raw: string | null | undefined,
  fallbackYmd: string,
): string {
  const value = (raw ?? "").trim().slice(0, 10);
  if (parseBusinessDate(value)) return value;
  return fallbackYmd;
}

export function availabilityOverviewDates(fromYmd: string): string[] {
  if (!parseBusinessDate(fromYmd)) return [];
  const dates: string[] = [];
  for (let offset = 0; offset < AVAILABILITY_OVERVIEW_DAY_COUNT; offset += 1) {
    const next = addBusinessCalendarDays(fromYmd, offset);
    if (next) dates.push(next);
  }
  return dates;
}

export function shiftAvailabilityOverviewFrom(
  fromYmd: string,
  windowDelta: number,
): string {
  return (
    addBusinessCalendarDays(
      fromYmd,
      windowDelta * AVAILABILITY_OVERVIEW_DAY_COUNT,
    ) ?? fromYmd
  );
}

export function remainingCapacityQuantity(
  capacityQuantity: number,
  committedQuantity: number,
): number {
  return Math.max(0, capacityQuantity - committedQuantity);
}

export function overviewScopeStatus(
  capacityQuantity: number,
  committedQuantity: number,
): AvailabilityOverviewScopeStatus {
  return committedQuantity >= capacityQuantity ? "fully_booked" : "open";
}

export function overviewScopeLabel(input: {
  sizeLabel: string | null;
  collectionLabel: string | null;
}): string {
  const size = input.sizeLabel?.trim() || "All sizes";
  const collection = input.collectionLabel?.trim();
  return collection ? `${size} · ${collection}` : size;
}

export function committedQuantityForOverviewRow(
  lines: readonly AvailabilityOverviewCommittedLine[],
  row: Pick<
    AvailabilityOverviewCapacityRow,
    "pickupDate" | "cakeId" | "sizeId" | "collectionId"
  >,
): number {
  const scope: ProductionCapacityScope = {
    pickupDate: row.pickupDate,
    cakeId: row.cakeId,
    sizeId: row.sizeId,
    collectionId: row.collectionId,
  };
  return committedQuantityForCapacityScope(lines, scope);
}

function compareOverviewScopes(
  left: AvailabilityOverviewScopeView,
  right: AvailabilityOverviewScopeView,
): number {
  const cake = left.cakeName.localeCompare(right.cakeName);
  if (cake !== 0) return cake;
  if (left.sizeId === null && right.sizeId !== null) return -1;
  if (left.sizeId !== null && right.sizeId === null) return 1;
  const size = (left.sizeLabel ?? "").localeCompare(right.sizeLabel ?? "");
  if (size !== 0) return size;
  return (left.collectionLabel ?? "").localeCompare(right.collectionLabel ?? "");
}

export function buildAvailabilityOverviewDays(input: {
  dates: readonly string[];
  closedDates: readonly string[];
  rows: readonly AvailabilityOverviewCapacityRow[];
}): AvailabilityOverviewDay[] {
  const closed = closedPickupDateSet(input.closedDates);
  const byDate = new Map<string, AvailabilityOverviewCapacityRow[]>();
  for (const row of input.rows) {
    const existing = byDate.get(row.pickupDate) ?? [];
    existing.push(row);
    byDate.set(row.pickupDate, existing);
  }

  return input.dates.map((pickupDate) => {
    const scopes = (byDate.get(pickupDate) ?? []).map((row) => {
      const remainingQuantity = remainingCapacityQuantity(
        row.capacityQuantity,
        row.committedQuantity,
      );
      return {
        cakeId: row.cakeId,
        cakeName: row.cakeName,
        sizeId: row.sizeId,
        sizeLabel: row.sizeLabel,
        collectionId: row.collectionId,
        collectionLabel: row.collectionLabel,
        scopeLabel: overviewScopeLabel(row),
        capacityQuantity: row.capacityQuantity,
        committedQuantity: row.committedQuantity,
        remainingQuantity,
        status: overviewScopeStatus(
          row.capacityQuantity,
          row.committedQuantity,
        ),
      };
    });
    scopes.sort(compareOverviewScopes);
    return {
      pickupDate,
      closed: closed.has(pickupDate),
      unrestricted: scopes.length === 0,
      scopes,
    };
  });
}
