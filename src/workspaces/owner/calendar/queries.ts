import {
  hasActiveAdjustmentCode,
  RM10_CARD_CODE,
} from "@/engines/orders/promotions";
import { createClient } from "@/lib/supabase/server";
import type { GuestOrderStatus, OrderSource } from "@/types/storefront";
import { guestOrderDisplayName } from "@/workspaces/owner/orders/labels";
import type {
  CalendarCakeItem,
  CalendarEntry,
} from "@/workspaces/owner/calendar/types";
import { monthVisibleRange } from "@/workspaces/owner/calendar/month-grid";

const GUEST_CALENDAR_STATUSES: GuestOrderStatus[] = [
  "submitted",
  "pending_confirmation",
  "awaiting_payment",
  "paid",
];

const CALENDAR_ORDER_SELECT = `
  id,
  guest_name,
  pickup_date,
  pickup_time,
  status,
  order_source,
  crew_order,
  needs_bakery_attention,
  ready_at,
  picked_up_at,
  order_items (
    id,
    cake_name,
    size_label,
    quantity,
    created_at
  )
`;

type CalendarItemRow = {
  id: string;
  cake_name: string | null;
  size_label: string | null;
  quantity: number;
  created_at: string;
};

type CalendarOrderRow = {
  id: string;
  guest_name: string | null;
  pickup_date: string;
  pickup_time: string;
  status: string;
  order_source: string;
  crew_order: boolean | null;
  needs_bakery_attention: boolean | null;
  ready_at: string | null;
  picked_up_at: string | null;
  order_items?: CalendarItemRow[] | null;
};

type AdjustmentSlimRow = {
  order_id: string;
  code: string | null;
  status: string | null;
  reverses_adjustment_id: string | null;
};

function normalizePickupTime(value: string): string {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!match) return value;
  return `${match[1]}:${match[2]}:${match[3] ?? "00"}`;
}

function compareCalendarEntries(a: CalendarEntry, b: CalendarEntry): number {
  const timeCmp = a.pickupTime.localeCompare(b.pickupTime);
  if (timeCmp !== 0) return timeCmp;
  const nameCmp = a.customerName.localeCompare(b.customerName, "en", {
    sensitivity: "base",
  });
  if (nameCmp !== 0) return nameCmp;
  return a.displayName.localeCompare(b.displayName, "en", {
    sensitivity: "base",
  });
}

function mapItems(rows: CalendarItemRow[] | null | undefined): CalendarCakeItem[] {
  const sorted = [...(rows ?? [])].sort((a, b) => {
    const createdCmp = a.created_at.localeCompare(b.created_at);
    if (createdCmp !== 0) return createdCmp;
    return a.id.localeCompare(b.id);
  });

  return sorted.map((row) => ({
    id: row.id,
    cakeName: row.cake_name?.trim() || "Cake",
    sizeLabel: row.size_label?.trim() || "Size",
    quantity: Number(row.quantity) || 1,
  }));
}

function mapEntry(
  row: CalendarOrderRow,
  hasEffectiveRm10: boolean,
): CalendarEntry {
  const status = row.status as GuestOrderStatus;
  const orderSource = row.order_source as OrderSource;
  const crewOrder = Boolean(row.crew_order);
  const customerName = row.guest_name ?? "Guest";

  return {
    kind: "order",
    id: row.id,
    pickupDate: row.pickup_date,
    pickupTime: normalizePickupTime(row.pickup_time),
    customerName,
    displayName: guestOrderDisplayName({
      customerName,
      orderSource,
      crewOrder,
    }),
    status,
    needsBakeryAttention: Boolean(row.needs_bakery_attention),
    hasEffectiveRm10,
    readyAt: row.ready_at,
    pickedUpAt: row.picked_up_at,
    items: mapItems(row.order_items),
  };
}

async function loadEffectiveRm10ByOrderId(
  orderIds: string[],
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (orderIds.length === 0) return result;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_adjustments")
    .select("order_id, code, status, reverses_adjustment_id")
    .in("order_id", orderIds);

  if (error) {
    throw new Error(error.message);
  }

  const byOrder = new Map<string, AdjustmentSlimRow[]>();
  for (const row of (data ?? []) as AdjustmentSlimRow[]) {
    const list = byOrder.get(row.order_id) ?? [];
    list.push(row);
    byOrder.set(row.order_id, list);
  }

  for (const orderId of orderIds) {
    const adjustments = (byOrder.get(orderId) ?? []).map((adj) => ({
      code: adj.code,
      status: (adj.status ?? "active") as "active" | "reversed",
      reversesAdjustmentId: adj.reverses_adjustment_id,
    }));
    result.set(
      orderId,
      hasActiveAdjustmentCode(adjustments, RM10_CARD_CODE),
    );
  }

  return result;
}

/**
 * Slim month read model for Whole Cake Calendar.
 * Nested order_items snapshots + one batched adjustments query — no workspace loads.
 */
export async function listCalendarEntriesForMonth(
  year: number,
  month: number,
): Promise<CalendarEntry[]> {
  const { from, to } = monthVisibleRange(year, month);
  return listCalendarEntriesForPickupRange(from, to);
}

export async function listCalendarEntriesForPickupRange(
  fromYmd: string,
  toYmd: string,
): Promise<CalendarEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(CALENDAR_ORDER_SELECT)
    .is("customer_id", null)
    .in("status", GUEST_CALENDAR_STATUSES)
    .gte("pickup_date", fromYmd)
    .lte("pickup_date", toYmd)
    .order("pickup_date", { ascending: true })
    .order("pickup_time", { ascending: true })
    .order("guest_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as CalendarOrderRow[];
  if (rows.length === 0) return [];

  const rm10ByOrder = await loadEffectiveRm10ByOrderId(rows.map((row) => row.id));

  return rows
    .map((row) => mapEntry(row, rm10ByOrder.get(row.id) ?? false))
    .sort(compareCalendarEntries);
}

/** Single-entry refresh for realtime upsert (null if not a calendar guest order). */
export async function getCalendarEntryByOrderId(
  orderId: string,
): Promise<CalendarEntry | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(CALENDAR_ORDER_SELECT)
    .eq("id", orderId)
    .is("customer_id", null)
    .in("status", GUEST_CALENDAR_STATUSES)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  const row = data as CalendarOrderRow;
  const rm10ByOrder = await loadEffectiveRm10ByOrderId([orderId]);

  return mapEntry(row, rm10ByOrder.get(orderId) ?? false);
}
