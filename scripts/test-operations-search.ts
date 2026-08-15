/**
 * Operations board search: URL parse/build, cross-date matching, empty copy, returnTo.
 * Run: npx tsx scripts/test-operations-search.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_OPERATIONS_QUERY,
  OPERATIONS_SEARCH_ALL_DATES_CUE,
  OPERATIONS_SEARCH_EMPTY_DESCRIPTION,
  OPERATIONS_SEARCH_EMPTY_TITLE,
  buildOperationsBoardPath,
  filterAndSortOperationsOrders,
  matchesOperationsSearch,
  operationsSearchSpansPickupDates,
  parseOperationsBoardSearchParams,
  type OperationsBoardOrder,
} from "@/engines/operations/order-board";
import {
  ownerOrderWorkspaceHref,
  resolveOwnerReturnTo,
} from "@/workspaces/owner/navigation/return-to";

const now = new Date("2026-08-15T08:00:00+08:00");

const rows: OperationsBoardOrder[] = [
  {
    id: "today-amy",
    orderNumber: "ORD-20260815-0001",
    customerName: "Amy",
    phone: "0123456789",
    pickupDate: "2026-08-15",
    pickupTime: "14:00",
    status: "submitted",
    createdAt: "2026-08-14T00:00:00.000Z",
  },
  {
    id: "past-ben",
    orderNumber: "ORD-20260810-0315",
    customerName: "Ben",
    phone: "0191112222",
    pickupDate: "2026-08-10",
    pickupTime: "16:00",
    status: "submitted",
    createdAt: "2026-08-09T00:00:00.000Z",
  },
  {
    id: "future-amy",
    orderNumber: "ORD-20260915-0002",
    customerName: "Amy Lee",
    phone: "0129998888",
    pickupDate: "2026-09-15",
    pickupTime: "10:00",
    status: "paid",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
];

// Search stays out of the default Today landing URL.
assert.deepEqual(parseOperationsBoardSearchParams({}), DEFAULT_OPERATIONS_QUERY);
assert.equal(buildOperationsBoardPath(DEFAULT_OPERATIONS_QUERY), "/owner");
assert.equal(parseOperationsBoardSearchParams({ pickup: "today" }).search, "");
assert.equal(
  operationsSearchSpansPickupDates(DEFAULT_OPERATIONS_QUERY),
  false,
);

// URL parsing trims and round-trips search with pickup/status/sort.
const parsed = parseOperationsBoardSearchParams({
  search: " testdeli ",
  pickup: "today",
});
assert.equal(parsed.search, "testdeli");
assert.equal(parsed.pickupFilter, "today");
assert.equal(buildOperationsBoardPath(parsed), "/owner?search=testdeli");

const withFilters = parseOperationsBoardSearchParams({
  search: "ORD-20260810-0315",
  date: "2026-08-16",
  status: "submitted",
  sort: "pickup_asc",
});
assert.equal(withFilters.search, "ORD-20260810-0315");
assert.equal(withFilters.pickupFilter, "custom");
assert.equal(withFilters.customPickupDate, "2026-08-16");
assert.equal(withFilters.statusFilter, "submitted");
assert.equal(withFilters.sort, "pickup_asc");
assert.equal(
  buildOperationsBoardPath(withFilters),
  "/owner?search=ORD-20260810-0315&date=2026-08-16&status=submitted&sort=pickup_asc",
);

assert.equal(
  parseOperationsBoardSearchParams({ search: "   " }).search,
  "",
);
assert.equal(
  buildOperationsBoardPath({ ...DEFAULT_OPERATIONS_QUERY, search: "  " }),
  "/owner",
);

// Without search, Today still hides other pickup dates.
const todayOnly = filterAndSortOperationsOrders(
  rows,
  DEFAULT_OPERATIONS_QUERY,
  now,
);
assert.deepEqual(
  todayOnly.map((row) => row.id),
  ["today-amy"],
);

// Search from the default Today query finds past and future matches.
assert.equal(operationsSearchSpansPickupDates({ search: "Amy" }), true);
const byName = filterAndSortOperationsOrders(
  rows,
  { ...DEFAULT_OPERATIONS_QUERY, search: "Amy" },
  now,
);
assert.deepEqual(
  byName.map((row) => row.id),
  ["today-amy", "future-amy"],
);

const byNumber = filterAndSortOperationsOrders(
  rows,
  { ...DEFAULT_OPERATIONS_QUERY, search: "ORD-20260810-0315" },
  now,
);
assert.deepEqual(
  byNumber.map((row) => row.id),
  ["past-ben"],
);

assert.equal(matchesOperationsSearch(rows[1]!, "0315"), true);
assert.equal(matchesOperationsSearch(rows[1]!, "2222"), true);

const empty = filterAndSortOperationsOrders(
  rows,
  { ...DEFAULT_OPERATIONS_QUERY, search: "no-such-guest" },
  now,
);
assert.equal(empty.length, 0);

// Status still applies while searching across dates.
const paidAmy = filterAndSortOperationsOrders(
  rows,
  { ...DEFAULT_OPERATIONS_QUERY, search: "Amy", statusFilter: "paid" },
  now,
);
assert.deepEqual(
  paidAmy.map((row) => row.id),
  ["future-amy"],
);

// Opening an order from a search restores search (+ other board params).
assert.equal(
  resolveOwnerReturnTo("/owner?search=testdeli").href,
  "/owner?search=testdeli",
);
assert.equal(resolveOwnerReturnTo("/owner?search=testdeli").label, "Operations");
assert.equal(
  ownerOrderWorkspaceHref("ord-1", "/owner?search=testdeli"),
  `/owner/orders/ord-1?returnTo=${encodeURIComponent("/owner?search=testdeli")}`,
);
assert.equal(
  resolveOwnerReturnTo(
    "/owner?search=Amy&date=2026-08-16&status=submitted&sort=pickup_asc",
  ).href,
  "/owner?search=Amy&date=2026-08-16&status=submitted&sort=pickup_asc",
);

// Existing Home / default Operations return behaviour is unchanged.
assert.equal(resolveOwnerReturnTo("/home").href, "/home");
assert.equal(resolveOwnerReturnTo("/home").label, "Home");
assert.equal(
  ownerOrderWorkspaceHref("ord-1", "/home"),
  `/owner/orders/ord-1?returnTo=${encodeURIComponent("/home")}`,
);
assert.equal(resolveOwnerReturnTo("/owner").href, "/owner");
assert.equal(resolveOwnerReturnTo(undefined).href, "/owner");
assert.equal(ownerOrderWorkspaceHref("ord-1", "/owner"), "/owner/orders/ord-1");
assert.equal(
  resolveOwnerReturnTo("/owner/calendar?year=2026&month=8&view=orders").label,
  "Whole Cake Calendar",
);
assert.equal(resolveOwnerReturnTo("/owner/approvals").href, "/owner/approvals");

const boardSrc = readFileSync(
  resolve("src/workspaces/owner/OperationsLiveBoard.tsx"),
  "utf8",
);
assert.match(boardSrc, /OPERATIONS_SEARCH_EMPTY_TITLE/);
assert.match(boardSrc, /OPERATIONS_SEARCH_EMPTY_DESCRIPTION/);
assert.match(boardSrc, /operationsSearchSpansPickupDates/);
assert.doesNotMatch(
  boardSrc,
  /isTodayView = query\.pickupFilter === "today";/,
);

const toolbarSrc = readFileSync(
  resolve("src/workspaces/owner/OperationsBoardToolbar.tsx"),
  "utf8",
);
assert.match(toolbarSrc, /OPERATIONS_SEARCH_ALL_DATES_CUE/);

assert.equal(OPERATIONS_SEARCH_ALL_DATES_CUE, "Searching all pickup dates");
assert.equal(OPERATIONS_SEARCH_EMPTY_TITLE, "No matching orders.");
assert.equal(
  OPERATIONS_SEARCH_EMPTY_DESCRIPTION,
  "No order matched this search across all pickup dates.",
);

const pageSrc = readFileSync(resolve("src/app/(app)/owner/page.tsx"), "utf8");
assert.match(pageSrc, /search\?: string/);

const returnSrc = readFileSync(
  resolve("src/workspaces/owner/navigation/return-to.ts"),
  "utf8",
);
assert.match(returnSrc, /params\.get\("search"\)/);

const homeSrc = readFileSync(
  resolve("src/workspaces/home/HomeCockpit.tsx"),
  "utf8",
);
assert.match(homeSrc, /\/owner\?pickup=today/);

console.log("PASS operations search URL + cross-date + return");
