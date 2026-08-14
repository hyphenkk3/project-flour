"use server";

import { redirect } from "next/navigation";
import { canViewWholeCakeCalendar } from "@/engines/orders/delivery-finance-capabilities";
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

/** Calendar reads — Owner + Customer Operations (view). No mutations here. */
async function requireCalendarViewer() {
  const staff = await requireStaff();
  if (!canViewWholeCakeCalendar(staff.role.code)) {
    redirect("/home");
  }
  return staff;
}

export async function listCalendarEntriesForMonthAction(
  year: number,
  month: number,
): Promise<CalendarEntry[]> {
  await requireCalendarViewer();
  return listCalendarEntriesForMonth(year, month);
}

export async function listCalendarExtraMarkersForMonthAction(
  year: number,
  month: number,
): Promise<CalendarExtraMarker[]> {
  await requireCalendarViewer();
  return listCalendarExtraMarkersForMonth(year, month);
}

export async function getCalendarEntryByOrderIdAction(
  orderId: string,
): Promise<CalendarEntry | null> {
  await requireCalendarViewer();
  return getCalendarEntryByOrderId(orderId);
}

/**
 * Full guest-order detail for Calendar Quick View.
 * One fetch per open — does not enlarge the slim month Calendar query.
 */
export async function getCalendarQuickViewOrderAction(
  orderId: string,
): Promise<StorefrontOrder | null> {
  await requireCalendarViewer();
  return getGuestOrderById(orderId);
}
