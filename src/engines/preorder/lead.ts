import {
  addCalendarDays,
  malaysiaPreorderBusinessDate,
} from "@/engines/preorder/business-date";
import {
  DEFAULT_CUSTOMER_PREORDER_DAYS,
  DEFAULT_MALAYSIA_PREORDER_CLOCK,
  type CartEarliestResult,
  type PreorderBusinessClock,
  type PreorderCartLine,
  type Ymd,
} from "@/engines/preorder/types";

export { DEFAULT_CUSTOMER_PREORDER_DAYS };

export function parsePreorderDays(value: unknown): number | null {
  const n =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/** Storefront/draft fallback when a size row has no usable value. */
export function readPreorderDays(
  value: unknown,
  fallback: number = DEFAULT_CUSTOMER_PREORDER_DAYS,
): number {
  return parsePreorderDays(value) ?? fallback;
}

export function preorderCartLineId(cakeId: string, cakeSizeId: string): string {
  return `${cakeId}::${cakeSizeId}`;
}

/** businessDate + preorderDays (DAY 0 model). */
export function earliestCollectionDateForDays(
  businessDate: Ymd,
  preorderDays: number,
): Ymd {
  const days = parsePreorderDays(preorderDays);
  if (days == null) {
    return addCalendarDays(businessDate, DEFAULT_CUSTOMER_PREORDER_DAYS) ?? businessDate;
  }
  return addCalendarDays(businessDate, days) ?? businessDate;
}

export function emptyCartEarliestCollectionDate(
  at: Date = new Date(),
  clock: PreorderBusinessClock = DEFAULT_MALAYSIA_PREORDER_CLOCK,
): Ymd {
  return earliestCollectionDateForDays(
    malaysiaPreorderBusinessDate(at, clock),
    DEFAULT_CUSTOMER_PREORDER_DAYS,
  );
}

export function lineEarliestCollectionDate(
  line: PreorderCartLine,
  businessDate: Ymd,
): Ymd {
  return earliestCollectionDateForDays(businessDate, line.preorderDays);
}

/**
 * Cart earliest = MAX(line earliests).
 * Empty cart uses the default 2-day floor.
 * Blocking lines are those whose earliest equals the cart earliest.
 */
export function cartEarliestCollectionDate(
  lines: readonly PreorderCartLine[],
  businessDate: Ymd,
): CartEarliestResult {
  if (lines.length === 0) {
    return {
      earliestYmd: earliestCollectionDateForDays(
        businessDate,
        DEFAULT_CUSTOMER_PREORDER_DAYS,
      ),
      blockingLineIds: [],
    };
  }

  const withEarliest = lines.map((line) => ({
    lineId: line.lineId,
    earliestYmd: lineEarliestCollectionDate(line, businessDate),
  }));
  let maxYmd = withEarliest[0]!.earliestYmd;
  for (const entry of withEarliest) {
    if (entry.earliestYmd > maxYmd) maxYmd = entry.earliestYmd;
  }
  return {
    earliestYmd: maxYmd,
    blockingLineIds: withEarliest
      .filter((entry) => entry.earliestYmd === maxYmd)
      .map((entry) => entry.lineId),
  };
}
