import {
  DEFAULT_MALAYSIA_PREORDER_CLOCK,
  MALAYSIA_TIME_ZONE,
  type PreorderBusinessClock,
  type Ymd,
} from "@/engines/preorder/types";

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export function isYmd(value: string): value is Ymd {
  return YMD.test(value.trim());
}

/** Add whole calendar days using UTC date arithmetic (no host timezone). */
export function addCalendarDays(ymd: Ymd, days: number): Ymd | null {
  const match = YMD.exec(ymd.trim());
  if (!match) return null;
  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]) + days,
    ),
  );
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function malaysiaDateTimeParts(at: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MALAYSIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

function ymdFromParts(parts: {
  year: number;
  month: number;
  day: number;
}): Ymd {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function rolloverSeconds(rolloverTime: string): number {
  const match = TIME.exec(rolloverTime.trim());
  if (!match) return 0;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return 0;
  }
  return hour * 3600 + minute * 60 + second;
}

/**
 * Preorder DAY 0 in Asia/Kuala_Lumpur.
 * Matches `malaysia_preorder_business_date(timestamptz)`:
 * midnight rollover → calendar date; otherwise timestamps before the
 * configured local rollover still belong to the previous calendar day.
 */
export function malaysiaPreorderBusinessDate(
  at: Date,
  clock: PreorderBusinessClock = DEFAULT_MALAYSIA_PREORDER_CLOCK,
): Ymd {
  const local = malaysiaDateTimeParts(at);
  const calendar = ymdFromParts(local);
  const boundary = rolloverSeconds(clock.rolloverTime);
  if (boundary === 0) {
    return calendar;
  }
  const localSeconds =
    local.hour * 3600 + local.minute * 60 + local.second;
  if (localSeconds < boundary) {
    return addCalendarDays(calendar, -1) ?? calendar;
  }
  return calendar;
}
