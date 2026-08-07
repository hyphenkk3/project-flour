import { createClient } from "@/lib/supabase/server";
import type {
  StorefrontOrder,
  StorefrontOrderItem,
  StorefrontOrderListItem,
} from "@/types/storefront";

type OrderRow = {
  id: string;
  order_number: string;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  pickup_date: string;
  pickup_time: string;
  customer_notes: string | null;
  internal_notes: string | null;
  status: "submitted" | "pending_confirmation";
  created_at: string;
  order_items?: Array<{
    id: string;
    order_id: string;
    cake_id: string;
    cake_size_id: string;
    quantity: number;
    unit_price: number | string;
    library_cakes?: { name: string } | { name: string }[] | null;
    library_cake_sizes?: { label: string } | { label: string }[] | null;
  }> | null;
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapItem(
  row: NonNullable<OrderRow["order_items"]>[number],
): StorefrontOrderItem {
  const cake = relationOne(row.library_cakes);
  const size = relationOne(row.library_cake_sizes);
  return {
    id: row.id,
    orderId: row.order_id,
    cakeId: row.cake_id,
    cakeSizeId: row.cake_size_id,
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    cakeName: cake?.name ?? "Cake",
    sizeLabel: size?.label ?? "Size",
  };
}

function mapOrder(row: OrderRow): StorefrontOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.guest_name ?? "Guest",
    phone: row.guest_phone ?? "",
    email: row.guest_email ?? "",
    pickupDate: row.pickup_date,
    pickupTime: row.pickup_time,
    notes: row.customer_notes,
    internalNotes: row.internal_notes,
    status: row.status,
    createdAt: row.created_at,
    items: (row.order_items ?? []).map(mapItem),
  };
}

const orderSelect = `
  id,
  order_number,
  guest_name,
  guest_phone,
  guest_email,
  pickup_date,
  pickup_time,
  customer_notes,
  internal_notes,
  status,
  created_at,
  order_items (
    id,
    order_id,
    cake_id,
    cake_size_id,
    quantity,
    unit_price,
    library_cakes ( name ),
    library_cake_sizes ( label )
  )
`;

/** Guest website orders only (customer_id is null). */
export async function listGuestOrders(): Promise<StorefrontOrderListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(orderSelect)
    .is("customer_id", null)
    .in("status", ["submitted", "pending_confirmation"])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data as unknown as OrderRow[]).map(mapListItem);
}

export async function getGuestOrderListItem(
  id: string,
): Promise<StorefrontOrderListItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(orderSelect)
    .eq("id", id)
    .is("customer_id", null)
    .in("status", ["submitted", "pending_confirmation"])
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  return mapListItem(data as unknown as OrderRow);
}

function mapListItem(row: OrderRow): StorefrontOrderListItem {
  const order = mapOrder(row);
  const first = order.items[0];
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    cakeName: first?.cakeName ?? "—",
    sizeLabel: first?.sizeLabel ?? "—",
    pickupDate: order.pickupDate,
    pickupTime: order.pickupTime,
    status: order.status,
    createdAt: order.createdAt,
  };
}

export async function getGuestOrderById(
  id: string,
): Promise<StorefrontOrder | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(orderSelect)
    .eq("id", id)
    .is("customer_id", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  return mapOrder(data as unknown as OrderRow);
}
