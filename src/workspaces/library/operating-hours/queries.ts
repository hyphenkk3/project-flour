import { OPERATING_HOURS_SEED } from "@/engines/business-calendar/operating-hours-seed";
import {
  weekdayFromYmd,
  type OperatingHoursCapability,
  type OperatingHoursDateOverride,
  type OperatingHoursSnapshot,
  type OperatingHoursWeeklyRow,
} from "@/engines/business-calendar/operating-hours";
import { createClient } from "@/lib/supabase/server";

type WeeklyDbRow = {
  capability: string;
  weekday: number;
  enabled: boolean;
  opens_at: string | null;
  closes_at: string | null;
  latest_bookable: string | null;
  usual_start: string | null;
  usual_end: string | null;
};

type OverrideDbRow = WeeklyDbRow & {
  override_date: string;
  note: string | null;
};

function hm(value: string | null | undefined): string | null {
  if (!value) return null;
  return String(value).slice(0, 5);
}

function mapWeekly(row: WeeklyDbRow): OperatingHoursWeeklyRow {
  return {
    capability: row.capability as OperatingHoursCapability,
    weekday: Number(row.weekday),
    enabled: Boolean(row.enabled),
    opensAt: hm(row.opens_at),
    closesAt: hm(row.closes_at),
    latestBookable: hm(row.latest_bookable),
    usualStart: hm(row.usual_start),
    usualEnd: hm(row.usual_end),
  };
}

function missingTable(message: string): boolean {
  return /operating_hours_weekly|schema cache|does not exist/i.test(message);
}

export async function loadOperatingHoursSnapshot(): Promise<OperatingHoursSnapshot> {
  try {
    const supabase = await createClient();
    const weeklyResult = await supabase
      .from("operating_hours_weekly")
      .select(
        "capability, weekday, enabled, opens_at, closes_at, latest_bookable, usual_start, usual_end",
      );
    if (weeklyResult.error) {
      if (missingTable(weeklyResult.error.message)) return OPERATING_HOURS_SEED;
      throw new Error(weeklyResult.error.message);
    }
    const overrideResult = await supabase
      .from("operating_hours_date_overrides")
      .select(
        "override_date, capability, enabled, opens_at, closes_at, latest_bookable, usual_start, usual_end, note",
      )
      .order("override_date");
    if (overrideResult.error) {
      if (missingTable(overrideResult.error.message)) return OPERATING_HOURS_SEED;
      throw new Error(overrideResult.error.message);
    }
    const weekly = (weeklyResult.data ?? []).map((row) =>
      mapWeekly(row as WeeklyDbRow),
    );
    if (weekly.length === 0) return OPERATING_HOURS_SEED;
    const overrides: OperatingHoursDateOverride[] = (overrideResult.data ?? []).map(
      (row) => {
        const item = row as OverrideDbRow;
        const date = String(item.override_date).slice(0, 10);
        return {
          ...mapWeekly({ ...item, weekday: weekdayFromYmd(date) ?? 0 }),
          overrideDate: date,
          note: item.note,
        };
      },
    );
    return { weekly, overrides };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (missingTable(message)) return OPERATING_HOURS_SEED;
    throw error;
  }
}
