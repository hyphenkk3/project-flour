"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OPERATING_HOURS_CAPABILITIES } from "@/engines/business-calendar/operating-hours";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessWorkspace } from "@/foundation/navigation/access";
import { parseBusinessDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { LibraryActionState } from "@/workspaces/library/action-state";

async function requireLibraryStaff() {
  const staff = await requireStaff();
  if (!canAccessWorkspace(staff.role.code, "library")) {
    redirect("/home");
  }
  return staff;
}

function parseTime(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) return null;
  return text;
}

function revalidateHours() {
  revalidatePath("/library/operating-hours");
  revalidatePath("/order");
  revalidatePath("/order/checkout");
  revalidatePath("/extra");
}

export async function saveWeeklyOperatingHoursAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const capability = String(formData.get("capability") ?? "");
  if (!OPERATING_HOURS_CAPABILITIES.includes(capability as never)) {
    return { error: "Choose a valid hours section." };
  }
  const supabase = await createClient();
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const enabled = String(formData.get(`enabled_${weekday}`) ?? "") === "on";
    const opensAt = parseTime(formData.get(`opens_${weekday}`));
    const closesAt = parseTime(formData.get(`closes_${weekday}`));
    const latestBookable = parseTime(formData.get(`latest_${weekday}`));
    const usualStart = parseTime(formData.get(`usual_start_${weekday}`));
    const usualEnd = parseTime(formData.get(`usual_end_${weekday}`));
    const { error } = await supabase.from("operating_hours_weekly").upsert(
      {
        capability,
        weekday,
        enabled,
        opens_at: enabled ? opensAt : null,
        closes_at: enabled ? closesAt : null,
        latest_bookable: enabled ? latestBookable : null,
        usual_start: enabled ? usualStart : null,
        usual_end: enabled ? usualEnd : null,
      },
      { onConflict: "capability,weekday" },
    );
    if (error) return { error: error.message };
  }
  revalidateHours();
  return { error: null };
}

export async function saveDateOverrideAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const overrideDate = String(formData.get("override_date") ?? "").trim();
  if (!parseBusinessDate(overrideDate)) {
    return { error: "Choose a valid date." };
  }
  const note = String(formData.get("note") ?? "").trim() || null;
  const supabase = await createClient();
  for (const capability of OPERATING_HOURS_CAPABILITIES) {
    const mode = String(formData.get(`mode_${capability}`) ?? "weekly");
    if (mode === "weekly") {
      await supabase
        .from("operating_hours_date_overrides")
        .delete()
        .eq("override_date", overrideDate)
        .eq("capability", capability);
      continue;
    }
    const enabled = mode === "open";
    const { error } = await supabase.from("operating_hours_date_overrides").upsert(
      {
        override_date: overrideDate,
        capability,
        enabled,
        opens_at: enabled ? parseTime(formData.get(`opens_${capability}`)) : null,
        closes_at: enabled ? parseTime(formData.get(`closes_${capability}`)) : null,
        latest_bookable: enabled
          ? parseTime(formData.get(`latest_${capability}`))
          : null,
        usual_start: enabled
          ? parseTime(formData.get(`usual_start_${capability}`))
          : null,
        usual_end: enabled ? parseTime(formData.get(`usual_end_${capability}`)) : null,
        note,
      },
      { onConflict: "override_date,capability" },
    );
    if (error) return { error: error.message };
  }
  revalidateHours();
  return { error: null };
}

export async function deleteDateOverrideAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  await requireLibraryStaff();
  const overrideDate = String(formData.get("override_date") ?? "").trim();
  if (!parseBusinessDate(overrideDate)) {
    return { error: "Choose a valid date." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("operating_hours_date_overrides")
    .delete()
    .eq("override_date", overrideDate);
  if (error) return { error: error.message };
  revalidateHours();
  return { error: null };
}
