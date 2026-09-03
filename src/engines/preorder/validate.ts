import { addCalendarDays } from "@/engines/preorder/business-date";
import { cartEarliestCollectionDate } from "@/engines/preorder/lead";
import { CUSTOMER_DATE_CAPACITY_SEARCH_DAYS } from "@/engines/preorder/capacity";
import { formatShortBusinessDate } from "@/lib/dates";
import {
  FULLY_BOOKED_CUSTOMER_LABEL,
  JOIN_WAITING_LIST_CUSTOMER_LABEL,
  type CollectionDateCapacity,
  type CollectionDateEvaluation,
  type PreorderCartLine,
  type Ymd,
} from "@/engines/preorder/types";

export {
  FULLY_BOOKED_CUSTOMER_LABEL,
  JOIN_WAITING_LIST_CUSTOMER_LABEL,
};

export const SELECTED_DATE_NO_LONGER_AVAILABLE_MESSAGE =
  "Your selected date is no longer available for this order.";

export type EvaluateCollectionDateInput = {
  selectedYmd: Ymd;
  businessDate: Ymd;
  lines: readonly PreorderCartLine[];
  operatingOpen: boolean;
  closed: boolean;
  inCatalogue: boolean;
  /** Omit or leave undefined when no matching capacity row (unrestricted). */
  capacity?: CollectionDateCapacity | null;
};

/**
 * Ordered evaluation:
 * 1. preorder requirement
 * 2. operating/slot availability
 * 3. explicit date closure
 * 4. catalogue/special-menu membership
 * 5. capacity
 */
export function evaluateCollectionDate(
  input: EvaluateCollectionDateInput,
): CollectionDateEvaluation {
  const { earliestYmd, blockingLineIds } = cartEarliestCollectionDate(
    input.lines,
    input.businessDate,
  );

  if (input.selectedYmd < earliestYmd) {
    return {
      valid: false,
      earliestYmd,
      blockingLineIds,
      reason: {
        code: "before_preorder",
        earliestYmd,
        blockingLineIds,
      },
    };
  }

  if (!input.operatingOpen) {
    return {
      valid: false,
      earliestYmd,
      blockingLineIds,
      reason: { code: "operating_closed" },
    };
  }

  if (input.closed) {
    return {
      valid: false,
      earliestYmd,
      blockingLineIds,
      reason: { code: "orders_closed" },
    };
  }

  if (!input.inCatalogue) {
    return {
      valid: false,
      earliestYmd,
      blockingLineIds,
      reason: { code: "not_in_catalogue" },
    };
  }

  if (input.capacity?.fullyBooked) {
    return {
      valid: false,
      earliestYmd,
      blockingLineIds,
      reason: {
        code: "fully_booked",
        waitingListOffered: input.capacity.waitingListEnabled,
        blockingCakeNames: uniqueCakeNames(
          input.capacity.blockingCakeNames ?? [],
        ),
        selectedYmd: input.capacity.selectedYmd ?? input.selectedYmd,
        nextAvailableYmd: input.capacity.nextAvailableYmd ?? null,
      },
    };
  }

  return {
    valid: true,
    earliestYmd,
    blockingLineIds,
    reason: { code: "ok" },
  };
}

export function formatPreorderDayMonth(ymd: Ymd): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return ymd;
  return `${Number(match[3])}/${Number(match[2])}`;
}

function uniqueCakeNames(names: readonly string[]): string[] {
  const result: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed || result.includes(trimmed)) continue;
    result.push(trimmed);
  }
  return result;
}

export function customerFullyBookedDateMessage(input: {
  selectedYmd: Ymd;
  blockingCakeNames: readonly string[];
  nextAvailableYmd?: Ymd | null;
}): string {
  const dateLabel = formatShortBusinessDate(input.selectedYmd);
  const names = uniqueCakeNames(input.blockingCakeNames);
  const nextLabel = input.nextAvailableYmd
    ? formatShortBusinessDate(input.nextAvailableYmd)
    : null;

  let base: string;
  if (names.length === 1) {
    base = `${names[0]} is fully booked for ${dateLabel}.`;
  } else if (names.length > 1) {
    base = `Some items in your order are fully booked for ${dateLabel}.`;
  } else {
    base = nextLabel
      ? `Fully booked for ${dateLabel}.`
      : `${FULLY_BOOKED_CUSTOMER_LABEL} for your current order.`;
  }

  if (nextLabel) {
    return `${base.replace(/\.$/, "")}. Next available: ${nextLabel}.`;
  }
  return base;
}

function blockingLineLabels(
  lines: readonly PreorderCartLine[],
  blockingLineIds: readonly string[],
): string[] {
  const byId = new Map(lines.map((line) => [line.lineId, line]));
  const labels: string[] = [];
  for (const id of blockingLineIds) {
    const line = byId.get(id);
    if (!line) continue;
    labels.push(`${line.cakeName} (${line.sizeLabel})`);
  }
  return labels;
}

export function customerCollectionDateMessage(
  evaluation: CollectionDateEvaluation,
  lines: readonly PreorderCartLine[],
): string | null {
  const reason = evaluation.reason;
  if (reason.code === "ok") return null;
  if (reason.code === "before_preorder") {
    const names = blockingLineLabels(lines, reason.blockingLineIds);
    const earliest = formatPreorderDayMonth(reason.earliestYmd);
    if (names.length === 1) {
      return `Your selected date is too soon for ${names[0]}. The earliest collection date is ${earliest}.`;
    }
    if (names.length === 2) {
      return `Your selected date is too soon for ${names[0]} and ${names[1]}. The earliest collection date is ${earliest}.`;
    }
    if (names.length > 2) {
      const rest = names.slice(0, -1).join(", ");
      return `Your selected date is too soon for ${rest}, and ${names[names.length - 1]}. The earliest collection date is ${earliest}.`;
    }
    return `Your selected date is too soon. The earliest collection date is ${earliest}.`;
  }
  if (reason.code === "orders_closed") {
    return "Orders are closed for that pickup date.";
  }
  if (reason.code === "operating_closed") {
    return "Please choose a valid date and time.";
  }
  if (reason.code === "not_in_catalogue") {
    return "Please add at least one cake from the catalogue for that pickup date.";
  }
  if (reason.code === "fully_booked") {
    return customerFullyBookedDateMessage({
      selectedYmd: reason.selectedYmd,
      blockingCakeNames: reason.blockingCakeNames,
      nextAvailableYmd: reason.nextAvailableYmd,
    });
  }
  return "Please choose a valid date and time.";
}

export function customerSelectedDateInvalidatedMessage(
  detail: string | null,
): string {
  if (!detail) return SELECTED_DATE_NO_LONGER_AVAILABLE_MESSAGE;
  if (detail.startsWith(SELECTED_DATE_NO_LONGER_AVAILABLE_MESSAGE)) {
    return detail;
  }
  return `${SELECTED_DATE_NO_LONGER_AVAILABLE_MESSAGE} ${detail}`;
}

export function findNextValidCollectionDate(input: {
  fromYmdExclusive: Ymd;
  businessDate: Ymd;
  lines: readonly PreorderCartLine[];
  closedDates: readonly string[];
  operatingOpen: (ymd: Ymd) => boolean;
  inCatalogue?: (ymd: Ymd) => boolean;
  capacityForDate: (ymd: Ymd) => CollectionDateCapacity | null;
  maxYmd?: Ymd | null;
  searchDays?: number;
}): Ymd | null {
  const limit = input.searchDays ?? CUSTOMER_DATE_CAPACITY_SEARCH_DAYS;
  for (let offset = 1; offset <= limit; offset += 1) {
    const ymd = addCalendarDays(input.fromYmdExclusive, offset);
    if (!ymd) return null;
    if (input.maxYmd && ymd > input.maxYmd) return null;
    const evaluation = evaluateCollectionDate({
      selectedYmd: ymd,
      businessDate: input.businessDate,
      lines: input.lines,
      operatingOpen: input.operatingOpen(ymd),
      closed: input.closedDates.includes(ymd),
      inCatalogue: input.inCatalogue ? input.inCatalogue(ymd) : true,
      capacity: input.capacityForDate(ymd),
    });
    if (evaluation.valid) return ymd;
  }
  return null;
}
