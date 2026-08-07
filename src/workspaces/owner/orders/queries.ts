import { createClient } from "@/lib/supabase/server";
import { calculateOrderTotal } from "@/engines/orders/totals";
import type {
  ConfirmationSnapshot,
  GuestOrderStatus,
  OrderTimelineEvent,
  StorefrontComplimentaryItem,
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
  status: GuestOrderStatus;
  created_at: string;
  confirmation_needs_resend: boolean | null;
  collection_id: string | null;
  order_items?: Array<{
    id: string;
    order_id: string;
    cake_id: string;
    cake_size_id: string;
    quantity: number;
    unit_price: number | string;
    cake_name: string | null;
    size_label: string | null;
    library_cakes?: { name: string } | { name: string }[] | null;
    library_cake_sizes?: { label: string } | { label: string }[] | null;
  }> | null;
  order_complimentary_items?: Array<{
    id: string;
    name: string;
    quantity: number;
    sort_order: number;
    complimentary_item_type_id: string | null;
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
    cakeName: row.cake_name ?? cake?.name ?? "Cake",
    sizeLabel: row.size_label ?? size?.label ?? "Size",
  };
}

function mapComplimentary(
  row: NonNullable<OrderRow["order_complimentary_items"]>[number],
): StorefrontComplimentaryItem {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    sortOrder: row.sort_order,
    complimentaryItemTypeId: row.complimentary_item_type_id,
  };
}

function mapOrder(row: OrderRow): StorefrontOrder {
  const items = (row.order_items ?? []).map(mapItem);
  const complimentaryItems = [...(row.order_complimentary_items ?? [])]
    .map(mapComplimentary)
    .sort((a, b) => a.sortOrder - b.sortOrder);

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
    confirmationNeedsResend: Boolean(row.confirmation_needs_resend),
    collectionId: row.collection_id,
    items,
    complimentaryItems,
    total: calculateOrderTotal(items),
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
  confirmation_needs_resend,
  collection_id,
  order_items (
    id,
    order_id,
    cake_id,
    cake_size_id,
    quantity,
    unit_price,
    cake_name,
    size_label,
    library_cakes ( name ),
    library_cake_sizes ( label )
  ),
  order_complimentary_items (
    id,
    name,
    quantity,
    sort_order,
    complimentary_item_type_id
  )
`;

const GUEST_STATUSES: GuestOrderStatus[] = [
  "submitted",
  "pending_confirmation",
  "awaiting_payment",
];

/** Guest website orders only (customer_id is null). */
export async function listGuestOrders(): Promise<StorefrontOrderListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(orderSelect)
    .is("customer_id", null)
    .in("status", GUEST_STATUSES)
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
    .in("status", GUEST_STATUSES)
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
    additionalItemCount: Math.max(0, order.items.length - 1),
    pickupDate: order.pickupDate,
    pickupTime: order.pickupTime,
    status: order.status,
    createdAt: order.createdAt,
    confirmationNeedsResend: order.confirmationNeedsResend,
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

export async function listOrderTimeline(
  orderId: string,
): Promise<OrderTimelineEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_timeline_events")
    .select(
      `
      id,
      order_id,
      event_type,
      actor_staff_id,
      metadata,
      created_at,
      staff_profiles!actor_staff_id ( display_name )
    `,
    )
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error) {
    // Fallback without embed if relationship hint fails in some environments
    const fallback = await supabase
      .from("order_timeline_events")
      .select("id, order_id, event_type, actor_staff_id, metadata, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    if (fallback.error) {
      throw new Error(fallback.error.message);
    }
    return (fallback.data ?? []).map((row) => ({
      id: row.id as string,
      orderId: row.order_id as string,
      eventType: row.event_type as string,
      actorStaffId: (row.actor_staff_id as string | null) ?? null,
      actorName: null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.created_at as string,
    }));
  }

  return (data ?? []).map((row) => {
    const staff = relationOne(
      (row as { staff_profiles?: { display_name: string } | { display_name: string }[] | null })
        .staff_profiles,
    );
    return {
      id: row.id as string,
      orderId: row.order_id as string,
      eventType: row.event_type as string,
      actorStaffId: (row.actor_staff_id as string | null) ?? null,
      actorName: staff?.display_name ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.created_at as string,
    };
  });
}

export async function listConfirmationSnapshots(
  orderId: string,
): Promise<ConfirmationSnapshot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_confirmation_snapshots")
    .select("*")
    .eq("order_id", orderId)
    .order("version", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    orderId: row.order_id as string,
    version: row.version as number,
    lifecycleStatus: row.lifecycle_status as "sent" | "outdated",
    messageBody: row.message_body as string,
    snapshotPayload: row.snapshot_payload as ConfirmationSnapshot["snapshotPayload"],
    preparedBy: (row.prepared_by as string | null) ?? null,
    preparedAt: (row.prepared_at as string | null) ?? null,
    sentBy: (row.sent_by as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    outdatedAt: (row.outdated_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

export type CollectionComplimentaryOption = {
  typeId: string;
  name: string;
  isAvailable: boolean;
  isDefault: boolean;
  defaultQuantity: number;
  sortOrder: number;
};

export async function listCollectionComplimentaryOptions(
  collectionId: string,
): Promise<CollectionComplimentaryOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collection_complimentary_items")
    .select(
      `
      is_available,
      is_default,
      default_quantity,
      sort_order,
      complimentary_item_types ( id, name )
    `,
    )
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const type = relationOne(
      row.complimentary_item_types as
        | { id: string; name: string }
        | { id: string; name: string }[]
        | null,
    );
    return {
      typeId: type?.id ?? "",
      name: type?.name ?? "Item",
      isAvailable: Boolean(row.is_available),
      isDefault: Boolean(row.is_default),
      defaultQuantity: Number(row.default_quantity ?? 1),
      sortOrder: Number(row.sort_order ?? 0),
    };
  });
}
