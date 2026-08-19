/**
 * Reusable Operations board query helpers.
 * Designed for Owner Operations now; reusable later by Bakery / other boards.
 * Pure functions — no network.
 */

import type { GuestOrderStatus } from "@/types/storefront";

export type OperationsBoardOrder = {
  id: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  pickupDate: string;
  pickupTime: string;
  status: GuestOrderStatus;
  createdAt: string;
};

export type OperationsPickupFilter =
  | "all"
  | "today"
  | "tomorrow"
  | "this_week"
  | "custom";

export type OperationsStatusFilter = "all" | GuestOrderStatus;

export type OperationsSortOption =
  | "pickup_asc"
  | "pickup_desc"
  | "created_desc"
  | "created_asc"
  | "customer_asc"
  | "customer_desc";

export const DEFAULT_OPERATIONS_SORT: OperationsSortOption = "created_desc";

export const OPERATIONS_SORT_OPTIONS: Array<{
  value: OperationsSortOption;
  label: string;
}> = [
  { value: "pickup_asc", label: "Pickup Date — Earliest First" },
  { value: "pickup_desc", label: "Pickup Date — Latest First" },
  { value: "created_desc", label: "Latest Orders — Newest First" },
  { value: "created_asc", label: "Oldest Orders — Oldest First" },
  { value: "customer_asc", label: "Customer — A to Z" },
  { value: "customer_desc", label: "Customer — Z to A" },
];

export type OperationsBoardQuery = {
  search: string;
  pickupFilter: OperationsPickupFilter;
  customPickupDate: string | null;
  statusFilter: OperationsStatusFilter;
  sort: OperationsSortOption;
};

export const DEFAULT_OPERATIONS_QUERY: OperationsBoardQuery = {
  search: "",
  pickupFilter: "today",
  customPickupDate: null,
  statusFilter: "all",
  sort: DEFAULT_OPERATIONS_SORT,
};

function singaporeYmd(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addCalendarDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Monday–Sunday of the Asia/Singapore calendar week containing `ymd`. */
export function singaporeWeekRange(ymd: string): { start: string; end: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay(); // 0 Sun … 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = addCalendarDaysYmd(ymd, mondayOffset);
  const end = addCalendarDaysYmd(start, 6);
  return { start, end };
}

export function operationsTodayYmd(now: Date = new Date()): string {
  return singaporeYmd(now);
}

export function operationsTomorrowYmd(now: Date = new Date()): string {
  return addCalendarDaysYmd(singaporeYmd(now), 1);
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function matchesOperationsSearch(
  order: OperationsBoardOrder,
  search: string,
): boolean {
  const raw = search.trim();
  if (!raw) return true;

  const needle = raw.toLowerCase();
  const orderNumber = order.orderNumber.toLowerCase();
  const name = order.customerName.toLowerCase();
  const phoneDigits = digitsOnly(order.phone);
  const queryDigits = digitsOnly(raw);

  if (orderNumber.includes(needle)) return true;
  if (name.includes(needle)) return true;
  if (queryDigits && phoneDigits.includes(queryDigits)) return true;
  if (queryDigits.length === 4 && phoneDigits.endsWith(queryDigits)) return true;

  return false;
}

export function matchesOperationsPickupFilter(
  order: OperationsBoardOrder,
  pickupFilter: OperationsPickupFilter,
  customPickupDate: string | null,
  now: Date = new Date(),
): boolean {
  if (pickupFilter === "all") return true;
  const today = operationsTodayYmd(now);
  if (pickupFilter === "today") return order.pickupDate === today;
  if (pickupFilter === "tomorrow") {
    return order.pickupDate === operationsTomorrowYmd(now);
  }
  if (pickupFilter === "this_week") {
    const { start, end } = singaporeWeekRange(today);
    return order.pickupDate >= start && order.pickupDate <= end;
  }
  if (pickupFilter === "custom") {
    if (!customPickupDate) return false;
    return order.pickupDate === customPickupDate;
  }
  return true;
}

export function matchesOperationsStatusFilter(
  order: OperationsBoardOrder,
  statusFilter: OperationsStatusFilter,
): boolean {
  if (statusFilter === "all") return true;
  return order.status === statusFilter;
}

/** Non-empty search finds guest preorders across pickup dates. */
export function operationsSearchSpansPickupDates(
  query: Pick<OperationsBoardQuery, "search">,
): boolean {
  return query.search.trim() !== "";
}

export const OPERATIONS_SEARCH_ALL_DATES_CUE = "Searching all pickup dates";

export const OPERATIONS_SEARCH_EMPTY_TITLE = "No matching orders.";

export const OPERATIONS_SEARCH_EMPTY_DESCRIPTION =
  "No order matched this search across all pickup dates.";

function comparePickup(
  a: OperationsBoardOrder,
  b: OperationsBoardOrder,
  direction: 1 | -1,
): number {
  const dateCmp = a.pickupDate.localeCompare(b.pickupDate);
  if (dateCmp !== 0) return dateCmp * direction;
  const timeCmp = a.pickupTime.localeCompare(b.pickupTime);
  if (timeCmp !== 0) return timeCmp * direction;
  return a.createdAt.localeCompare(b.createdAt);
}

export function sortOperationsOrders<T extends OperationsBoardOrder>(
  orders: T[],
  sort: OperationsSortOption,
): T[] {
  const next = [...orders];
  next.sort((a, b) => {
    switch (sort) {
      case "pickup_asc":
        return comparePickup(a, b, 1);
      case "pickup_desc":
        return comparePickup(a, b, -1);
      case "created_desc":
        return b.createdAt.localeCompare(a.createdAt);
      case "created_asc":
        return a.createdAt.localeCompare(b.createdAt);
      case "customer_asc":
        return (
          a.customerName.localeCompare(b.customerName, "en", {
            sensitivity: "base",
          }) || comparePickup(a, b, 1)
        );
      case "customer_desc":
        return (
          b.customerName.localeCompare(a.customerName, "en", {
            sensitivity: "base",
          }) || comparePickup(a, b, 1)
        );
      default:
        return comparePickup(a, b, 1);
    }
  });
  return next;
}

export function filterAndSortOperationsOrders<T extends OperationsBoardOrder>(
  orders: T[],
  query: OperationsBoardQuery,
  now: Date = new Date(),
): T[] {
  const spanPickupDates = operationsSearchSpansPickupDates(query);
  const filtered = orders.filter(
    (order) =>
      matchesOperationsSearch(order, query.search) &&
      (spanPickupDates ||
        matchesOperationsPickupFilter(
          order,
          query.pickupFilter,
          query.customPickupDate,
          now,
        )) &&
      matchesOperationsStatusFilter(order, query.statusFilter),
  );
  return sortOperationsOrders(filtered, query.sort);
}

/** Search + status only — used to surface confirmation-not-prepared inbox beyond Today. */
export function operationsSearchAndStatusMatches<T extends OperationsBoardOrder>(
  orders: T[],
  query: Pick<OperationsBoardQuery, "search" | "statusFilter">,
): T[] {
  return orders.filter(
    (order) =>
      matchesOperationsSearch(order, query.search) &&
      matchesOperationsStatusFilter(order, query.statusFilter),
  );
}

export function isOperationsQueryDefault(query: OperationsBoardQuery): boolean {
  return (
    query.search.trim() === "" &&
    query.pickupFilter === "today" &&
    !query.customPickupDate &&
    query.statusFilter === "all" &&
    query.sort === DEFAULT_OPERATIONS_SORT
  );
}

export const OPERATIONS_PICKUP_FILTERS: Array<{
  value: OperationsPickupFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this_week", label: "This Week" },
  { value: "custom", label: "Choose Date" },
];

/** Status chips for Operations — real GuestOrderStatus values only. */
export const OPERATIONS_STATUS_FILTERS: Array<{
  value: OperationsStatusFilter;
  label: string;
}> = [
  { value: "all", label: "All Statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "pending_confirmation", label: "Pending Confirmation" },
  { value: "awaiting_payment", label: "Awaiting Payment" },
  { value: "paid", label: "Paid" },
];

export function operationsBoardSummary(
  query: OperationsBoardQuery,
  matchCount: number,
): string {
  const countLabel = `${matchCount} ${matchCount === 1 ? "order" : "orders"}`;
  if (query.pickupFilter === "all") {
    return countLabel;
  }
  const pickup = operationsPickupFilterLabel(
    query.pickupFilter,
    query.customPickupDate,
  );
  return `Pickup · ${pickup} · ${countLabel}`;
}

export function operationsPickupFilterLabel(
  pickupFilter: OperationsPickupFilter,
  customPickupDate: string | null,
): string {
  switch (pickupFilter) {
    case "all":
      return "All";
    case "today":
      return "Today";
    case "tomorrow":
      return "Tomorrow";
    case "this_week":
      return "This Week";
    case "custom":
      return customPickupDate ?? "Choose Date";
  }
}

export const OPERATIONS_BOARD_PATH = "/owner";

const OPERATIONS_BOARD_YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isOperationsBoardDate(value: string): boolean {
  if (!OPERATIONS_BOARD_YMD_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(year, month - 1, day);
  return (
    probe.getFullYear() === year &&
    probe.getMonth() === month - 1 &&
    probe.getDate() === day
  );
}

export function isOperationsPickupFilter(
  value: string,
): value is OperationsPickupFilter {
  return OPERATIONS_PICKUP_FILTERS.some((option) => option.value === value);
}

export function isOperationsStatusFilter(
  value: string,
): value is OperationsStatusFilter {
  return OPERATIONS_STATUS_FILTERS.some((option) => option.value === value);
}

export function isOperationsSortOption(
  value: string,
): value is OperationsSortOption {
  return OPERATIONS_SORT_OPTIONS.some((option) => option.value === value);
}

export type OperationsBoardSearchParams = {
  pickup?: string;
  date?: string;
  status?: string;
  sort?: string;
  search?: string;
};

/**
 * Read Operations board filters from URL query params.
 * `date=YYYY-MM-DD` selects that pickup date (Choose Date).
 * `search=` is restored after opening an order; a non-empty search
 * finds matching guest preorders across pickup dates.
 */
export function parseOperationsBoardSearchParams(
  input: OperationsBoardSearchParams,
): OperationsBoardQuery {
  const pickupRaw = input.pickup?.trim() ?? "";
  const pickup = isOperationsPickupFilter(pickupRaw) ? pickupRaw : null;
  const dateRaw = input.date?.trim() ?? "";
  const date = isOperationsBoardDate(dateRaw) ? dateRaw : null;
  const statusRaw = input.status?.trim() ?? "";
  const sortRaw = input.sort?.trim() ?? "";
  const search = input.search?.trim() ?? "";

  const statusFilter = isOperationsStatusFilter(statusRaw)
    ? statusRaw
    : DEFAULT_OPERATIONS_QUERY.statusFilter;
  const sort = isOperationsSortOption(sortRaw)
    ? sortRaw
    : DEFAULT_OPERATIONS_QUERY.sort;

  if (date && (pickup == null || pickup === "today" || pickup === "custom")) {
    return {
      search,
      pickupFilter: "custom",
      customPickupDate: date,
      statusFilter,
      sort,
    };
  }

  if (pickup === "custom") {
    return {
      search,
      pickupFilter: "custom",
      customPickupDate: date,
      statusFilter,
      sort,
    };
  }

  if (pickup && pickup !== "today") {
    return {
      search,
      pickupFilter: pickup,
      customPickupDate: null,
      statusFilter,
      sort,
    };
  }

  return {
    ...DEFAULT_OPERATIONS_QUERY,
    search,
    statusFilter,
    sort,
  };
}

/** Canonical Operations board href for the current filters. Default Today is `/owner`. */
export function buildOperationsBoardPath(query: OperationsBoardQuery): string {
  const params = new URLSearchParams();
  const search = query.search.trim();
  if (search) {
    params.set("search", search);
  }
  if (query.pickupFilter === "custom" && query.customPickupDate) {
    params.set("date", query.customPickupDate);
  } else if (query.pickupFilter === "custom") {
    params.set("pickup", "custom");
  } else if (query.pickupFilter !== "today") {
    params.set("pickup", query.pickupFilter);
  }
  if (query.statusFilter !== "all") {
    params.set("status", query.statusFilter);
  }
  if (query.sort !== DEFAULT_OPERATIONS_SORT) {
    params.set("sort", query.sort);
  }
  const encoded = params.toString();
  return encoded
    ? `${OPERATIONS_BOARD_PATH}?${encoded}`
    : OPERATIONS_BOARD_PATH;
}
