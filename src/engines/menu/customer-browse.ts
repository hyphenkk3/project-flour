import {
  addBusinessCalendarDays,
  formatBusinessCalendarDate,
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

export const SPECIAL_MENU_HEADING = "Special Menu";
export const SPECIAL_MENU_DESCRIPTION =
  "Special cakes for selected periods";

/** Customer-facing special period, e.g. "16–17 September 2026". */
export function customerSpecialMenuPeriodLabel(
  startDate: string,
  endDate: string,
): string | null {
  const from = startDate.trim().slice(0, 10);
  const to = endDate.trim().slice(0, 10);
  if (!isYmd(from) || !isYmd(to)) return null;
  const fromDay = Number(from.slice(8, 10));
  const toDay = Number(to.slice(8, 10));
  const fromMonthYear = formatBusinessMonthYear(from);
  const toMonthYear = formatBusinessMonthYear(to);
  if (from === to) {
    return `${fromDay} ${fromMonthYear}`;
  }
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return `${fromDay}–${toDay} ${toMonthYear}`;
  }
  return `${fromDay} ${fromMonthYear} → ${toDay} ${toMonthYear}`;
}
export const SPECIAL_PERIOD_CAKES_NOTE =
  "Special-period cakes are listed in the Special Menu.";
export const PAST_MENU_LABEL = "Past menu";

export type CatalogueExpiryInput = {
  purpose: string;
  status?: string;
  month?: string | null;
  endDate?: string | null;
  showInPastMenu?: boolean;
};

/** Last inclusive business date this catalogue can be ordered. */
export function catalogueValidThroughYmd(
  input: CatalogueExpiryInput,
): string | null {
  if (input.purpose === "monthly") {
    return catalogueMonthPickupBounds(input.month ?? "")?.to ?? null;
  }
  if (input.purpose === "special") {
    const end = (input.endDate ?? "").trim().slice(0, 10);
    return isYmd(end) ? end : null;
  }
  return null;
}

/** True from the calendar day after the catalogue's last valid date. */
export function isCatalogueExpired(
  input: CatalogueExpiryInput,
  todayYmd: string,
): boolean {
  const today = todayYmd.trim().slice(0, 10);
  const through = catalogueValidThroughYmd(input);
  if (!isYmd(today) || !through) return false;
  return today > through;
}

/**
 * Library Archived includes manually archived rows and live catalogues whose
 * date window has ended. Drafts are not auto-archived.
 */
export function isEffectivelyArchived(
  input: CatalogueExpiryInput,
  todayYmd: string,
): boolean {
  if (input.status === "archived") return true;
  return input.status === "active" && isCatalogueExpired(input, todayYmd);
}

/**
 * Customer Browse Past Menu: owner must opt in, and the catalogue must
 * already be past (expired active or archived). Never used for /order.
 */
export function isCustomerPastMenuVisible(
  input: CatalogueExpiryInput,
  todayYmd: string,
): boolean {
  if (input.showInPastMenu !== true) return false;
  if (isCurrentlyCustomerOrderable(input, todayYmd)) return false;
  return isEffectivelyArchived(input, todayYmd);
}

export function isCurrentlyCustomerOrderable(
  input: CatalogueExpiryInput & { websiteOverride?: boolean },
  todayYmd: string,
): boolean {
  if (input.status !== "active") return false;
  if (isCatalogueExpired(input, todayYmd)) return false;
  if (input.purpose === "monthly") {
    return isCustomerOrderableMonthlyMonth(
      input.month ?? null,
      todayYmd.slice(0, 7),
    );
  }
  if (input.purpose === "special") {
    return input.websiteOverride === true;
  }
  return false;
}

export function catalogueHistoryPeriodLabel(
  input: CatalogueExpiryInput & { startDate?: string | null },
): string | null {
  if (input.purpose === "monthly") {
    const start = monthStartYmd(input.month ?? "");
    return start ? formatBusinessMonthYear(start) : null;
  }
  if (input.purpose === "special") {
    const from = (input.startDate ?? "").trim().slice(0, 10);
    const to = (input.endDate ?? "").trim().slice(0, 10);
    if (!isYmd(from) || !isYmd(to)) return null;
    if (from === to) return formatBusinessCalendarDate(from);
    const fromLabel = formatBusinessCalendarDate(from);
    const toLabel = formatBusinessCalendarDate(to);
    const fromParts = fromLabel.split(" ");
    const toParts = toLabel.split(" ");
    if (
      fromParts.length === 3 &&
      toParts.length === 3 &&
      fromParts[1] === toParts[1] &&
      fromParts[2] === toParts[2]
    ) {
      return `${fromParts[0]}–${toParts[0]} ${toParts[1]} ${toParts[2]}`;
    }
    return `${fromLabel} → ${toLabel}`;
  }
  return null;
}

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Inclusive first and last calendar day of a monthly catalogue month. */
export function catalogueMonthPickupBounds(
  monthYmd: string,
): { from: string; to: string } | null {
  const from = monthStartYmd(monthYmd);
  const to = lastDayOfBusinessMonth(monthYmd);
  if (!from || !to) return null;
  return { from, to };
}

/**
 * Customer date-picker window for a collection. Never starts before the
 * earliest legal pickup date. Does not change catalogue eligibility.
 */
export function clampCustomerPickupWindow(
  earliest: string,
  windowFrom: string,
  windowTo: string,
): { min: string; max: string } | null {
  if (![earliest, windowFrom, windowTo].every(isYmd)) return null;
  if (windowFrom > windowTo) return null;
  const min = earliest > windowFrom ? earliest : windowFrom;
  if (min > windowTo) return null;
  return { min, max: windowTo };
}

export function monthOverlapsDateRange(
  monthYmd: string,
  rangeFrom: string,
  rangeTo: string,
): boolean {
  const bounds = catalogueMonthPickupBounds(monthYmd);
  const from = rangeFrom.trim().slice(0, 10);
  const to = rangeTo.trim().slice(0, 10);
  if (!bounds || !isYmd(from) || !isYmd(to)) return false;
  return bounds.from <= to && bounds.to >= from;
}

export function sortCustomerCatalogueChoices<
  T extends { id: string; displayOrder: number | null },
>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.displayOrder == null && b.displayOrder == null) {
      return a.id.localeCompare(b.id);
    }
    if (a.displayOrder == null) return 1;
    if (b.displayOrder == null) return -1;
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }
    return a.id.localeCompare(b.id);
  });
}

export type CustomerPickupWindow = { from: string; to: string };

/** True when the scope spans an entire monthly catalogue month (not a special window). */
export function isFullMonthPickupScope(from: string, to: string): boolean {
  if (!isYmd(from) || !isYmd(to)) return false;
  const bounds = catalogueMonthPickupBounds(from);
  return bounds?.from === from && bounds?.to === to;
}

/** Monthly catalogue months a cake belongs to → inclusive pickup windows. */
export function monthlyCataloguePickupWindows(
  monthlyYearMonths: readonly string[],
): CustomerPickupWindow[] {
  return monthlyYearMonths
    .map((month) => catalogueMonthPickupBounds(month))
    .filter((window): window is CustomerPickupWindow => Boolean(window));
}

/** Smallest contiguous picker range covering all supplied windows. */
export function unionPickupWindows(
  windows: readonly CustomerPickupWindow[],
  earliest: string,
): { min: string; max: string } | null {
  if (!isYmd(earliest) || windows.length === 0) return null;
  const valid = windows.filter(
    (pickupWindow) =>
      isYmd(pickupWindow.from) &&
      isYmd(pickupWindow.to) &&
      pickupWindow.from <= pickupWindow.to,
  );
  if (valid.length === 0) return null;
  let min = valid[0]!.from;
  let max = valid[0]!.to;
  for (const pickupWindow of valid.slice(1)) {
    if (pickupWindow.from < min) min = pickupWindow.from;
    if (pickupWindow.to > max) max = pickupWindow.to;
  }
  const boundedMin = earliest > min ? earliest : min;
  if (boundedMin > max) return null;
  return { min: boundedMin, max };
}

/** Overlap range when every cart cake must be valid on the same pickup date. */
export function intersectPickupWindows(
  windows: readonly CustomerPickupWindow[],
  earliest: string,
): { min: string; max: string } | null {
  if (!isYmd(earliest) || windows.length === 0) return null;
  let min = windows[0].from;
  let max = windows[0].to;
  for (let index = 1; index < windows.length; index += 1) {
    const pickupWindow = windows[index];
    if (
      !isYmd(pickupWindow.from) ||
      !isYmd(pickupWindow.to) ||
      pickupWindow.from > pickupWindow.to
    ) {
      return null;
    }
    min = min > pickupWindow.from ? min : pickupWindow.from;
    max = max < pickupWindow.to ? max : pickupWindow.to;
  }
  const boundedMin = earliest > min ? earliest : min;
  if (boundedMin > max) return null;
  return { min: boundedMin, max };
}

/** One cake may appear in several monthly catalogues and/or special windows. */
export function cakePickupDateBounds(
  monthlyYearMonths: readonly string[],
  specialWindows: readonly CustomerPickupWindow[],
  earliest: string,
): { min: string; max: string } | null {
  return unionPickupWindows(
    [...monthlyCataloguePickupWindows(monthlyYearMonths), ...specialWindows],
    earliest,
  );
}

export function enumerateYmdInclusive(from: string, to: string): string[] {
  if (!isYmd(from) || !isYmd(to) || from > to) return [];
  const dates: string[] = [];
  let cursor: string | null = from;
  while (cursor && cursor <= to) {
    dates.push(cursor);
    cursor = addBusinessCalendarDays(cursor, 1);
  }
  return dates;
}

function cakeOwnsSpecialWindow(
  cakeSpecialWindows: readonly CustomerPickupWindow[],
  special: CustomerPickupWindow,
): boolean {
  return cakeSpecialWindows.some(
    (window) => window.from === special.from && window.to === special.to,
  );
}

/**
 * True when this cake can be offered on `date` given monthly membership and
 * active special windows. Special catalogues own their dates unless the cake
 * is also a member of that special.
 */
export function isPickupDateAllowedForCake(
  date: string,
  membership: {
    monthlyMonths: readonly string[];
    specialWindows: readonly CustomerPickupWindow[];
  },
  activeSpecialWindows: readonly CustomerPickupWindow[],
  earliest: string,
): boolean {
  if (!isYmd(date) || !isYmd(earliest) || date < earliest) return false;
  if (
    membership.specialWindows.some(
      (window) => date >= window.from && date <= window.to,
    )
  ) {
    return true;
  }
  const inMonthly = membership.monthlyMonths.some((month) => {
    const bounds = catalogueMonthPickupBounds(month);
    return Boolean(bounds && date >= bounds.from && date <= bounds.to);
  });
  if (!inMonthly) return false;
  for (const special of activeSpecialWindows) {
    if (date < special.from || date > special.to) continue;
    if (!cakeOwnsSpecialWindow(membership.specialWindows, special)) {
      return false;
    }
  }
  return true;
}

/** Special-menu dates a monthly-only cake cannot use. */
export function cakePickupExcludedDates(
  monthlyMonths: readonly string[],
  cakeSpecialWindows: readonly CustomerPickupWindow[],
  activeSpecialWindows: readonly CustomerPickupWindow[],
): string[] {
  const excluded: string[] = [];
  for (const special of activeSpecialWindows) {
    if (cakeOwnsSpecialWindow(cakeSpecialWindows, special)) continue;
    const overlapsMonthly = monthlyMonths.some((month) =>
      monthOverlapsDateRange(month, special.from, special.to),
    );
    if (!overlapsMonthly) continue;
    excluded.push(...enumerateYmdInclusive(special.from, special.to));
  }
  return [...new Set(excluded)].sort();
}

/** Dates in [min, max] that are invalid for at least one cart cake. */
export function cartExcludedPickupDates(
  memberships: ReadonlyArray<{
    monthlyMonths: readonly string[];
    specialWindows: readonly CustomerPickupWindow[];
  }>,
  activeSpecialWindows: readonly CustomerPickupWindow[],
  min: string,
  max: string,
  earliest: string,
): string[] {
  if (!isYmd(min) || !isYmd(max) || memberships.length === 0) return [];
  return enumerateYmdInclusive(min, max).filter(
    (date) =>
      !memberships.every((membership) =>
        isPickupDateAllowedForCake(
          date,
          membership,
          activeSpecialWindows,
          earliest,
        ),
      ),
  );
}

/** Cart-wide bounds: every line must share at least one valid pickup date. */
export function cartPickupDateBounds(
  perCakeBounds: ReadonlyArray<{ min: string; max: string } | null>,
  earliest: string,
  globalMax: string | null,
): { min: string; max: string } | null {
  const valid = perCakeBounds.filter(
    (bounds): bounds is { min: string; max: string } => Boolean(bounds),
  );
  if (valid.length === 0) {
    if (!isYmd(earliest)) return null;
    const max = globalMax && isYmd(globalMax) ? globalMax : earliest;
    return earliest <= max ? { min: earliest, max } : null;
  }
  const intersected = intersectPickupWindows(
    valid.map((bounds) => ({ from: bounds.min, to: bounds.max })),
    earliest,
  );
  if (!intersected) return null;
  if (globalMax && isYmd(globalMax) && intersected.max > globalMax) {
    intersected.max = globalMax;
  }
  if (intersected.min > intersected.max) return null;
  return intersected;
}

/** Calendar months that contain at least one selectable day in [min, max]. */
export function navigablePickupMonths(min: string, max: string): string[] {
  if (!isYmd(min) || !isYmd(max) || min > max) return [];
  const months: string[] = [];
  let cursor = min.slice(0, 7);
  const end = max.slice(0, 7);
  while (cursor <= end) {
    months.push(cursor);
    const year = Number(cursor.slice(0, 4));
    const month = Number(cursor.slice(5, 7));
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    cursor = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
  }
  return months;
}

export type CheckoutPickupScopeInput = {
  earliest: string;
  scopeFrom: string | null;
  scopeTo: string | null;
  globalMax: string | null;
};

export type CheckoutPickupScope = {
  /** Whether scopeFrom/scopeTo also constrain min/max (special menus). */
  scopeConstrainsBounds: boolean;
  minPickupDate: string;
  maxPickupDate: string | null;
  suggestedPickupDate: string | null;
};

/**
 * Collection context sets the initial month. Full-month scopes do not clamp the
 * allowed range; narrow special-menu scopes do.
 */
export function resolveCheckoutPickupScope(
  input: CheckoutPickupScopeInput,
): CheckoutPickupScope {
  const earliest = input.earliest.trim().slice(0, 10);
  const globalMax =
    input.globalMax && isYmd(input.globalMax) ? input.globalMax : null;
  const scopeFrom = input.scopeFrom && isYmd(input.scopeFrom) ? input.scopeFrom : null;
  const scopeTo = input.scopeTo && isYmd(input.scopeTo) ? input.scopeTo : null;

  if (!scopeFrom || !scopeTo) {
    return {
      scopeConstrainsBounds: false,
      minPickupDate: earliest,
      maxPickupDate: globalMax,
      suggestedPickupDate: earliest,
    };
  }

  const scopeConstrainsBounds = !isFullMonthPickupScope(scopeFrom, scopeTo);
  const scopedWindow = clampCustomerPickupWindow(earliest, scopeFrom, scopeTo);

  if (scopeConstrainsBounds && scopedWindow) {
    return {
      scopeConstrainsBounds: true,
      minPickupDate: scopedWindow.min,
      maxPickupDate: scopedWindow.max,
      suggestedPickupDate: scopedWindow.min,
    };
  }

  const suggested =
    scopedWindow?.min ??
    suggestedPickupDateForCatalogueMonth(scopeFrom, earliest) ??
    earliest;

  return {
    scopeConstrainsBounds: false,
    minPickupDate: earliest,
    maxPickupDate: globalMax,
    suggestedPickupDate: suggested,
  };
}

export function collectionScopedCheckoutHref(input: {
  pickupDate: string | null;
  from: string;
  to: string;
}): string {
  const params = new URLSearchParams();
  if (input.pickupDate && isYmd(input.pickupDate)) {
    params.set("pickup", input.pickupDate);
  }
  params.set("from", input.from);
  params.set("to", input.to);
  return `/order/checkout?${params.toString()}`;
}

export function collectionScopedCakeHref(input: {
  cakeId: string;
  pickupDate: string | null;
  from: string;
  to: string;
}): string {
  const params = new URLSearchParams();
  if (input.pickupDate && isYmd(input.pickupDate)) {
    params.set("pickup", input.pickupDate);
  }
  params.set("from", input.from);
  params.set("to", input.to);
  return `/cakes/${input.cakeId}?${params.toString()}`;
}
