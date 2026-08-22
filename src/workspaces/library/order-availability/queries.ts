import { createClient } from "@/lib/supabase/server";
import {
  closedPickupDateSet,
  orderAvailabilityMonthDays,
} from "@/engines/business-calendar/order-availability";

export type OrderAvailabilityDay = {
  pickupDate: string;
  closed: boolean;
  note: string | null;
};

type OverrideRow = {
  pickup_date: string;
  closed: boolean | null;
  note: string | null;
};

function optionalNote(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : null;
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
