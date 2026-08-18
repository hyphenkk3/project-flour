import {
  formatBusinessMonthAbbrev,
  formatBusinessMonthYear,
  lastDayOfBusinessMonth,
} from "@/lib/dates";

export const CUSTOMER_PICKUP_DATE_CAKE_NOTICE =
  "Your available cakes depend on your pickup date.";

export type OrderableMonthlyCatalogueRow = {
  id: string;
  status: string;
  purpose: string;
  month: string | null;
};

function monthStartYmd(value: string): string | null {
  const key = yearMonthKey(value);
  return key ? `${key}-01` : null;
}

function longMonthName(yearMonth: string): string {
  const start = monthStartYmd(yearMonth);
  if (!start) return yearMonth;
  return formatBusinessMonthYear(start).replace(/ \d{4}$/, "");
}

function yearMonthKey(value: string): string | null {
  const key = value.trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) ? key : null;
}

/** True when a monthly catalogue month can be offered for customer preorder. */
export function isCustomerOrderableMonthlyMonth(
  monthYmd: string | null,
  todayYearMonth: string,
): boolean {
  const month = monthYmd ? yearMonthKey(monthYmd) : null;
  const today = yearMonthKey(todayYearMonth);
  if (!month || !today) return false;
  return month >= today;
}

/**
 * Browse/discovery note. Null when the cake is already in this Singapore month's
 * active monthly catalogue (or has no future monthly catalogue).
 */
export function browseCakeAvailabilityNote(
  todayYearMonth: string,
  monthlyYearMonths: readonly string[],
): string | null {
  const today = yearMonthKey(todayYearMonth);
  if (!today) return null;
  const upcoming = [
    ...new Set(
      monthlyYearMonths
        .map((value) => yearMonthKey(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ]
    .filter((month) => month >= today)
    .sort();
  const earliest = upcoming[0];
  if (!earliest || earliest === today) return null;
  const abbr = formatBusinessMonthAbbrev(earliest);
  const todayYear = today.slice(0, 4);
  const monthYear = earliest.slice(0, 4);
  if (monthYear === todayYear) {
    return `Available from ${abbr}`;
  }
  return `Available from ${abbr} ${monthYear}`;
}

/** First of the catalogue month, or earliest pickup if that is later. */
export function suggestedPickupDateForCatalogueMonth(
  monthStartYmd: string,
  earliestPickupYmd: string,
): string | null {
  const first = monthStartYmd.trim().slice(0, 10);
  const earliest = earliestPickupYmd.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || !/^\d{4}-\d{2}-\d{2}$/.test(earliest)) {
    return null;
  }
  return first > earliest ? first : earliest;
}

/** Active monthly catalogues customers may choose on the Order landing page. */
export function orderableMonthlyCatalogues<
  T extends OrderableMonthlyCatalogueRow,
>(rows: readonly T[], todayYearMonth: string): T[] {
  return [...rows]
    .filter(
      (row) =>
        row.status === "active" &&
        row.purpose === "monthly" &&
        isCustomerOrderableMonthlyMonth(row.month, todayYearMonth),
    )
    .sort((a, b) => {
      const left = yearMonthKey(a.month ?? "") ?? "";
      const right = yearMonthKey(b.month ?? "") ?? "";
      return left.localeCompare(right);
    });
}

export function orderCollectionHeadline(monthYmd: string): string {
  const start = monthStartYmd(monthYmd);
  if (!start) return "Collection";
  return `${formatBusinessMonthYear(start)} Collection`;
}

export function orderCollectionPickupCopy(
  monthYmd: string,
  todayYearMonth: string,
): string {
  const monthName = longMonthName(monthYmd);
  const month = yearMonthKey(monthYmd);
  const today = yearMonthKey(todayYearMonth);
  if (month && today && month === today) {
    return `Available for ${monthName} pickup`;
  }
  return `Preorders now open for ${monthName} pickup`;
}

export function homepageUpcomingPreorderPromo(yearMonth: string): {
  heading: string;
  cta: string;
} {
  const monthName = longMonthName(yearMonth);
  return {
    heading: `${monthName} preorders are now open`,
    cta: `Browse ${monthName}`,
  };
}

/** Last pickup date customers may select: last day of the latest published month. */
export function latestOrderableCataloguePickupEnd(
  monthlyYearMonths: readonly string[],
): string | null {
  const months = [
    ...new Set(
      monthlyYearMonths
        .map((value) => yearMonthKey(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
  const latest = months[months.length - 1];
  if (!latest) return null;
  return lastDayOfBusinessMonth(latest);
}

export function nextPublishedMonthlyYearMonth(
  todayYearMonth: string,
  monthlyYearMonths: readonly string[],
): string | null {
  const today = yearMonthKey(todayYearMonth);
  if (!today) return null;
  const future = [
    ...new Set(
      monthlyYearMonths
        .map((value) => yearMonthKey(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ]
    .filter((month) => month > today)
    .sort();
  return future[0] ?? null;
}
