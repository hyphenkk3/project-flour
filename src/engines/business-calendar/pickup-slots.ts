/**
 * Whitebird pickup slots — Milestone 1.1 temporary central config.
 * Later replaceable by Business Settings / Business Calendar Engine.
 * Values are 24h "HH:MM" (Postgres time-compatible).
 */

export type PickupSlot = {
  /** 24-hour time, e.g. "12:00" or "17:30" */
  value: string;
  /** Display label, e.g. "12:00 PM" */
  label: string;
};

const DAY = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
} as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function minutesToValue(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${pad(hours)}:${pad(minutes)}`;
}

function formatLabel(value: string): string {
  const [hRaw, mRaw] = value.split(":");
  const hours = Number(hRaw);
  const minutes = mRaw ?? "00";
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

function rangeSlots(
  startHm: string,
  endHm: string,
  stepMinutes = 30,
): string[] {
  const [sh, sm] = startHm.split(":").map(Number);
  const [eh, em] = endHm.split(":").map(Number);
  let cursor = sh * 60 + sm;
  const end = eh * 60 + em;
  const values: string[] = [];
  while (cursor <= end) {
    values.push(minutesToValue(cursor));
    cursor += stepMinutes;
  }
  return values;
}

/** Explicit Wednesday preorder pickup windows (store closed for walk-in). */
const WEDNESDAY_SLOTS = [
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
] as const;

/**
 * Returns valid pickup slots for a calendar date (YYYY-MM-DD).
 * Uses local calendar weekday of that date string (not timezone-shifted).
 */
export function getPickupSlotsForDate(dateYmd: string): PickupSlot[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return [];
  }

  const [year, month, day] = dateYmd.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();

  let values: string[];

  if (weekday === DAY.wednesday) {
    values = [...WEDNESDAY_SLOTS];
  } else if (
    weekday === DAY.friday ||
    weekday === DAY.saturday ||
    weekday === DAY.sunday
  ) {
    values = [...rangeSlots("12:00", "17:30"), ...rangeSlots("18:00", "21:30")];
  } else {
    // Monday, Tuesday, Thursday
    values = rangeSlots("12:00", "17:30");
  }

  return values.map((value) => ({
    value,
    label: formatLabel(value),
  }));
}

/** Normalize Postgres "HH:MM:SS" or "HH:MM" to "HH:MM". */
export function normalizePickupTimeValue(time: string): string {
  const parts = time.trim().split(":");
  if (parts.length < 2) return time.trim();
  return `${pad(Number(parts[0]))}:${pad(Number(parts[1]))}`;
}

export function isValidPickupSlot(dateYmd: string, timeValue: string): boolean {
  const normalized = normalizePickupTimeValue(timeValue);
  return getPickupSlotsForDate(dateYmd).some(
    (slot) => slot.value === normalized,
  );
}

export function earliestPickupDateYmd(from = new Date()): string {
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}
