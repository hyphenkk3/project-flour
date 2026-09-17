import { createClient } from "@/lib/supabase/server";
import type { PaymentStatus } from "@/types/order";
import {
  type CustomerHistoryOrder,
  guestPhoneFilterKeys,
  guestPhoneMatchesCustomer,
  groupCustomerHistory,
  type GroupedCustomerHistory,
  shouldAttemptGuestPhoneMatch,
} from "@/workspaces/customer-operations/customers/history";
import { digitsToFlexiblePhoneRegex } from "@/workspaces/customer-operations/customers/normalize";

const HISTORY_SELECT = [
  "id",
  "order_number",
  "customer_id",
  "guest_phone",
  "pickup_date",
  "pickup_time",
  "status",
  "payment_status",
  "fulfilment_method",
  "order_source",
  "extra_stock_id",
  "created_at",
  "picked_up_at",
  "delivered_at",
].join(", ");

type HistoryRow = {
  id: string;
  order_number: string;
  customer_id: string | null;
  guest_phone: string | null;
  pickup_date: string;
  pickup_time: string;
  status: string;
  payment_status: string | null;
  fulfilment_method: string | null;
  order_source: string | null;
  extra_stock_id: string | null;
  created_at: string;
  picked_up_at: string | null;
  delivered_at: string | null;
};

function mapRow(
  row: HistoryRow,
  match: CustomerHistoryOrder["match"],
): CustomerHistoryOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    guestPhone: row.guest_phone,
    pickupDate: row.pickup_date,
    pickupTime: row.pickup_time,
    status: row.status,
    paymentStatus: (row.payment_status as PaymentStatus | null) ?? null,
    fulfilmentMethod: row.fulfilment_method,
    orderSource: row.order_source,
    extraStockId: row.extra_stock_id,
    createdAt: row.created_at,
    pickedUpAt: row.picked_up_at,
    deliveredAt: row.delivered_at,
    match,
  };
}

function guestPhoneOrFilter(keys: string[]): string | null {
  const clauses = keys
    .map((key) => digitsToFlexiblePhoneRegex(key))
    .filter((regex) => regex.length > 0)
    .map((regex) => `guest_phone.imatch."${regex}"`);

  if (clauses.length === 0) {
    return null;
  }

  return clauses.join(",");
}

export async function loadCustomerOrderHistory(input: {
  customerId: string;
  phoneNormalized: string | null;
  phoneNumber: string | null;
  todayYmd: string;
}): Promise<GroupedCustomerHistory> {
  const supabase = await createClient();
  const guestMatchingUsed = shouldAttemptGuestPhoneMatch(
    input.phoneNormalized,
    input.phoneNumber,
  );

  const { data: linkedRows, error: linkedError } = await supabase
    .from("orders")
    .select(HISTORY_SELECT)
    .eq("customer_id", input.customerId);

  if (linkedError) {
    throw linkedError;
  }

  const linked = ((linkedRows ?? []) as unknown as HistoryRow[]).map((row) =>
    mapRow(row, "crm"),
  );

  let guest: CustomerHistoryOrder[] = [];

  if (guestMatchingUsed) {
    const keys = guestPhoneFilterKeys(
      input.phoneNormalized,
      input.phoneNumber,
    );
    const orFilter = guestPhoneOrFilter(keys);

    if (orFilter) {
      const { data: guestRows, error: guestError } = await supabase
        .from("orders")
        .select(HISTORY_SELECT)
        .is("customer_id", null)
        .not("guest_phone", "is", null)
        .or(orFilter);

      if (guestError) {
        throw guestError;
      }

      guest = ((guestRows ?? []) as unknown as HistoryRow[])
        .filter((row) =>
          guestPhoneMatchesCustomer(
            input.phoneNormalized,
            input.phoneNumber,
            row.guest_phone,
          ),
        )
        .map((row) => mapRow(row, "guest_phone"));
    }
  }

  return groupCustomerHistory(
    [...linked, ...guest],
    input.todayYmd,
    guestMatchingUsed,
  );
}
