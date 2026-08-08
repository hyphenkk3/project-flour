"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import {
  getCalendarEntryByOrderId,
  listCalendarEntriesForMonth,
} from "@/workspaces/owner/calendar/queries";
import type { CalendarEntry } from "@/workspaces/owner/calendar/types";

async function requireOwner() {
  const staff = await requireStaff();
  if (staff.role.code !== "owner") {
    redirect("/home");
  }
  return staff;
}

export async function listCalendarEntriesForMonthAction(
  year: number,
  month: number,
): Promise<CalendarEntry[]> {
  await requireOwner();
  return listCalendarEntriesForMonth(year, month);
}

export async function getCalendarEntryByOrderIdAction(
  orderId: string,
): Promise<CalendarEntry | null> {
  await requireOwner();
  return getCalendarEntryByOrderId(orderId);
}
