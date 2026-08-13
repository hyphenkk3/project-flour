"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import type { CalendarExtraMarker } from "@/engines/extra/calendar-visibility";
import {
  getCalendarEntryByOrderId,
  listCalendarEntriesForMonth,
  listCalendarExtraMarkersForMonth,
} from "@/workspaces/owner/calendar/queries";
import type { CalendarEntry } from "@/workspaces/owner/calendar/types";
import { getGuestOrderById } from "@/workspaces/owner/orders/queries";
import type { StorefrontOrder } from "@/types/storefront";

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

export async function listCalendarExtraMarkersForMonthAction(
  year: number,
  month: number,
): Promise<CalendarExtraMarker[]> {
  await requireOwner();
  return listCalendarExtraMarkersForMonth(year, month);
}

export async function getCalendarEntryByOrderIdAction(
  orderId: string,
): Promise<CalendarEntry | null> {
  await requireOwner();
  return getCalendarEntryByOrderId(orderId);
}

/**
 * Full Owner guest-order detail for Calendar Quick View.
 * One fetch per open — does not enlarge the slim month Calendar query.
 */
export async function getCalendarQuickViewOrderAction(
  orderId: string,
): Promise<StorefrontOrder | null> {
  await requireOwner();
  return getGuestOrderById(orderId);
}
