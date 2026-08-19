import type {
  OperatingHoursCapability,
  OperatingHoursSnapshot,
  OperatingHoursWeeklyRow,
} from "@/engines/business-calendar/operating-hours";

function row(
  capability: OperatingHoursCapability,
  weekday: number,
  enabled: boolean,
  opensAt: string | null,
  closesAt: string | null,
  latestBookable: string | null,
  usualStart: string | null = null,
  usualEnd: string | null = null,
): OperatingHoursWeeklyRow {
  return {
    capability,
    weekday,
    enabled,
    opensAt,
    closesAt,
    latestBookable,
    usualStart,
    usualEnd,
  };
}

function weeklyRows(): OperatingHoursWeeklyRow[] {
  const rows: OperatingHoursWeeklyRow[] = [];
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const weekend = weekday === 0 || weekday === 5 || weekday === 6;
    const wednesday = weekday === 3;

    if (wednesday) {
      rows.push(
        row("pickup", weekday, true, "12:00", "15:00", "15:00", "13:00", "15:00"),
      );
    } else if (weekend) {
      rows.push(
        row("pickup", weekday, true, "12:00", "21:30", "21:30", "15:00", "17:30"),
      );
    } else {
      rows.push(
        row("pickup", weekday, true, "12:00", "17:30", "17:30", "15:00", "17:30"),
      );
    }

    if (wednesday) {
      rows.push(row("delivery", weekday, false, null, null, null));
    } else {
      rows.push(row("delivery", weekday, true, "12:00", "15:00", "15:00"));
    }

    if (wednesday) {
      rows.push(row("dine_in", weekday, false, null, null, null));
    } else if (weekend) {
      rows.push(row("dine_in", weekday, true, "12:00", "21:30", "21:30"));
    } else {
      rows.push(row("dine_in", weekday, true, "12:00", "17:00", "17:00"));
    }

    if (wednesday) {
      rows.push(row("hyphen", weekday, false, null, null, null));
    } else {
      rows.push(row("hyphen", weekday, true, "09:00", "17:30", "17:00"));
    }

    if (wednesday) {
      rows.push(row("whitebird", weekday, false, null, null, null));
    } else if (weekend) {
      rows.push(row("whitebird", weekday, true, "10:00", "22:00", "21:30"));
    } else {
      rows.push(row("whitebird", weekday, true, "10:00", "17:30", "17:00"));
    }
  }
  return rows;
}

/** Seed matching the SQL migration. Tests and pre-migration fallback use this. */
export const OPERATING_HOURS_SEED: OperatingHoursSnapshot = {
  weekly: weeklyRows(),
  overrides: [],
};
