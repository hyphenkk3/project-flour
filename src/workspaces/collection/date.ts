/**
 * Collection fulfilment-date helpers (Asia/Singapore) — same calendar as Bakery.
 */

import type { CollectionBoardTab } from "@/workspaces/collection/board-tab";

const TIME_ZONE = "Asia/Singapore";

function singaporeYmd(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addCalendarDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function collectionTodayYmd(now: Date = new Date()): string {
  return singaporeYmd(now);
}

export function collectionTomorrowYmd(now: Date = new Date()): string {
  return addCalendarDaysYmd(singaporeYmd(now), 1);
}

export function collectionPlusTwoYmd(now: Date = new Date()): string {
  return addCalendarDaysYmd(singaporeYmd(now), 2);
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveCollectionBoardDate(
  raw: string | null | undefined,
  now: Date = new Date(),
): string {
  const value = (raw ?? "").trim();
  if (!YMD_RE.test(value)) return collectionTodayYmd(now);
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(y, m - 1, d);
  if (
    probe.getFullYear() !== y ||
    probe.getMonth() !== m - 1 ||
    probe.getDate() !== d
  ) {
    return collectionTodayYmd(now);
  }
  return value;
}

export function collectionDateNavHref(
  ymd: string,
  tab: CollectionBoardTab = "ready",
): string {
  const params = new URLSearchParams();
  params.set("date", ymd);
  if (tab !== "ready") params.set("tab", tab);
  return `/collection?${params.toString()}`;
}

export function collectionOrderHref(
  orderId: string,
  boardDate: string,
  tab: CollectionBoardTab = "ready",
): string {
  const params = new URLSearchParams();
  params.set("date", boardDate);
  if (tab !== "ready") params.set("tab", tab);
  return `/collection/orders/${orderId}?${params.toString()}`;
}

export type CollectionSingaporeWallClock = {
  ymd: string;
  hour: number;
  minute: number;
  second: number;
};

/** Asia/Singapore wall clock for an instant. Does not use the host timezone. */
export function collectionSingaporeWallClock(
  now: Date,
): CollectionSingaporeWallClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  let hour = Number(value("hour"));
  if (hour === 24) hour = 0;
  return {
    ymd: `${value("year")}-${value("month")}-${value("day")}`,
    hour,
    minute: Number(value("minute")),
    second: Number(value("second")),
  };
}
