import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  closedPickupDateSet,
  orderAvailabilityMonthDays,
} from "@/engines/business-calendar/order-availability";

export type OrderAvailabilityDay = {
  pickupDate: string;
  closed: boolean;
  note: string | null;
};

export type OrderAvailabilityEvent = {
  pickupDate: string;
  action: "closed" | "reopened";
  createdAt: string;
  actorName: string | null;
};

type OverrideRow = {
  pickup_date: string;
  closed: boolean | null;
  note: string | null;
};

type EventRow = {
  pickup_date: string;
  action: string;
  actor_staff_id: string | null;
  created_at: string;
};

function optionalNote(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : null;
}

function isMissingAvailabilityTable(message: string): boolean {
  return /order_availability_override|schema cache|does not exist/i.test(
    message,
  );
}

async function loadStaffDisplayNames(
  staffIds: readonly string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(staffIds.filter(Boolean))];
  if (unique.length === 0) return names;

  try {
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("staff_profiles")
      .select("id, display_name")
      .in("id", unique);
    if (error) return names;
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      const name = String(
        (row as { display_name?: string | null }).display_name ?? "",
      ).trim();
      if (id && name) names.set(id, name);
    }
  } catch {
    // Presentation-only; session RLS cannot read other staff profiles.
  }
  return names;
}

export async function listOrderAvailabilityDays(
  yearMonth: string,
): Promise<OrderAvailabilityDay[]> {
  const days = orderAvailabilityMonthDays(yearMonth);
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_availability_overrides")
    .select("pickup_date, closed, note")
    .gte("pickup_date", first)
    .lte("pickup_date", last);

  if (error) {
    throw new Error(error.message);
  }

  const notes = new Map<string, string | null>();
  const closed = closedPickupDateSet(
    (data ?? [])
      .filter((row: OverrideRow) => row.closed !== false)
      .map((row: OverrideRow) => String(row.pickup_date).slice(0, 10)),
  );
  for (const row of data ?? []) {
    const date = String(row.pickup_date).slice(0, 10);
    notes.set(date, optionalNote(row.note));
  }

  return days.map((pickupDate) => ({
    pickupDate,
    closed: closed.has(pickupDate),
    note: closed.has(pickupDate) ? (notes.get(pickupDate) ?? null) : null,
  }));
}

/**
 * Recent close/reopen history. Empty when the Phase 2 events table is absent.
 */
export async function listRecentOrderAvailabilityEvents(
  limit = 20,
): Promise<OrderAvailabilityEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_availability_override_events")
    .select("pickup_date, action, actor_staff_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingAvailabilityTable(error.message)) return [];
    throw new Error(error.message);
  }

  const rows = (data ?? []) as EventRow[];
  const names = await loadStaffDisplayNames(
    rows.map((row) => row.actor_staff_id ?? ""),
  );

  const events: OrderAvailabilityEvent[] = [];
  for (const row of rows) {
    const action =
      row.action === "reopened"
        ? "reopened"
        : row.action === "closed"
          ? "closed"
          : null;
    if (!action) continue;
    const pickupDate = String(row.pickup_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) continue;
    const createdAt = String(row.created_at ?? "");
    if (!createdAt) continue;
    const actorId = row.actor_staff_id ? String(row.actor_staff_id) : "";
    events.push({
      pickupDate,
      action,
      createdAt,
      actorName: actorId ? (names.get(actorId) ?? null) : null,
    });
  }
  return events;
}
