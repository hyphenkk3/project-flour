import { createClient } from "@/lib/supabase/server";

function isMissingAvailabilityRpc(message: string): boolean {
  return /Could not find the function|schema cache|does not exist|order_availability/i.test(
    message,
  );
}

export async function listClosedPickupOrderDates(
  fromYmd: string,
  toYmd: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_closed_pickup_order_dates", {
    p_from: fromYmd,
    p_to: toYmd,
  });
  if (error) {
    if (isMissingAvailabilityRpc(error.message)) return [];
    throw new Error(error.message);
  }
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      if (typeof row === "string") return row.slice(0, 10);
      if (row && typeof row === "object" && "pickup_date" in row) {
        return String(
          (row as { pickup_date: string }).pickup_date,
        ).slice(0, 10);
      }
      return "";
    })
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function isPickupOrdersClosed(
  dateYmd: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_pickup_orders_closed", {
    p_date: dateYmd,
  });
  if (error) {
    if (isMissingAvailabilityRpc(error.message)) return false;
    throw new Error(error.message);
  }
  return data === true;
}
