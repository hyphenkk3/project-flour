import { createClient } from "@/lib/supabase/server";
import type {
  FulfilmentMethod,
  Order,
  OrderDetail,
  OrderListItem,
  OrderStatus,
  PaymentStatus,
} from "@/types/order";

type CustomerEmbed = {
  id: string;
  full_name: string;
  phone_number: string | null;
};

type StaffEmbed = {
  id: string;
  display_name: string;
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_id: string;
  fulfilment_method: FulfilmentMethod;
  pickup_date: string;
  pickup_time: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  internal_notes: string | null;
  customer_notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  customers: CustomerEmbed | CustomerEmbed[] | null;
  created_staff?: StaffEmbed | StaffEmbed[] | null;
  updated_staff?: StaffEmbed | StaffEmbed[] | null;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerId: row.customer_id,
    fulfilmentMethod: row.fulfilment_method,
    pickupDate: row.pickup_date,
    pickupTime: row.pickup_time,
    status: row.status,
    paymentStatus: row.payment_status,
    internalNotes: row.internal_notes,
    customerNotes: row.customer_notes,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOrderListItem(row: OrderRow): OrderListItem {
  const customer = unwrapOne(row.customers);
  if (!customer) {
    throw new Error(`Order ${row.order_number} is missing a customer.`);
  }

  return {
    ...mapOrder(row),
    customer: {
      id: customer.id,
      fullName: customer.full_name,
      phoneNumber: customer.phone_number,
    },
  };
}

function mapOrderDetail(row: OrderRow): OrderDetail {
  const createdStaff = unwrapOne(row.created_staff);
  const updatedStaff = unwrapOne(row.updated_staff);

  return {
    ...mapOrderListItem(row),
    createdByName: createdStaff?.display_name ?? null,
    updatedByName: updatedStaff?.display_name ?? null,
  };
}

const listSelect = `
  id,
  order_number,
  customer_id,
  fulfilment_method,
  pickup_date,
  pickup_time,
  status,
  payment_status,
  internal_notes,
  customer_notes,
  created_by,
  updated_by,
  created_at,
  updated_at,
  customers!inner (
    id,
    full_name,
    phone_number
  )
`;

const detailSelect = `
  ${listSelect},
  created_staff:staff_profiles!created_by (
    id,
    display_name
  ),
  updated_staff:staff_profiles!updated_by (
    id,
    display_name
  )
`;

export async function listOrders(): Promise<OrderListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(listSelect)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as unknown as OrderRow[]).map(mapOrderListItem);
}

export async function getOrderById(id: string): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(detailSelect)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapOrderDetail(data as unknown as OrderRow) : null;
}

export async function allocateOrderNumber(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("allocate_order_number");

  if (error || typeof data !== "string" || data.length === 0) {
    throw error ?? new Error("Unable to allocate order number.");
  }

  return data;
}
