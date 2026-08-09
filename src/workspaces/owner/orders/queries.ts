import { createClient } from "@/lib/supabase/server";
import { calculateOrderSettlement } from "@/engines/orders/settlement";
import { calculateOrderTotal } from "@/engines/orders/totals";
import type {
  ConfirmationSnapshot,
  GuestOrderStatus,
  OrderAdjustment,
  OrderPaymentAllocationView,
  OrderRefundView,
  OrderSource,
  OrderTimelineEvent,
  PaymentMethodCode,
  Rm10IssuanceSuppressionCode,
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
  pickup_instruction: string | null;
  customer_notes: string | null;
  internal_notes: string | null;
  status: GuestOrderStatus;
  created_at: string;
  confirmation_needs_resend: boolean | null;
  collection_id: string | null;
  order_source: OrderSource | null;
  crew_order: boolean | null;
  include_receipt: boolean | null;
  needs_bakery_attention: boolean | null;
  bakery_attention_note: string | null;
  ready_at: string | null;
  ready_by: string | null;
  picked_up_at: string | null;
  picked_up_by: string | null;
  payment_deadline_at: string | null;
  payment_request_sent_at: string | null;
  rm10_card_issuance_suppressed: boolean | null;
  rm10_card_issuance_suppression_code: Rm10IssuanceSuppressionCode | null;
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

function mapOrder(
  row: OrderRow,
  financial?: {
    adjustments: OrderAdjustment[];
    paymentAllocations: OrderPaymentAllocationView[];
    refunds: OrderRefundView[];
  },
): StorefrontOrder {
  const items = (row.order_items ?? []).map(mapItem);
  const complimentaryItems = [...(row.order_complimentary_items ?? [])]
    .map(mapComplimentary)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const adjustments = financial?.adjustments ?? [];
  const paymentAllocations = financial?.paymentAllocations ?? [];
  const refunds = financial?.refunds ?? [];
  const settlement = calculateOrderSettlement({
    items,
    adjustments,
    allocations: paymentAllocations,
    refunds,
  });

  return {
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.guest_name ?? "Guest",
    phone: row.guest_phone ?? "",
    email: row.guest_email ?? "",
    pickupDate: row.pickup_date,
    pickupTime: row.pickup_time,
    pickupInstruction: row.pickup_instruction,
    notes: row.customer_notes,
    internalNotes: row.internal_notes,
    status: row.status,
    createdAt: row.created_at,
    confirmationNeedsResend: Boolean(row.confirmation_needs_resend),
    collectionId: row.collection_id,
    orderSource: row.order_source ?? "customer_website",
    crewOrder: Boolean(row.crew_order),
    includeReceipt: Boolean(row.include_receipt),
    needsBakeryAttention: Boolean(row.needs_bakery_attention),
    bakeryAttentionNote: row.bakery_attention_note,
    readyAt: row.ready_at,
    readyBy: row.ready_by,
    pickedUpAt: row.picked_up_at,
    pickedUpBy: row.picked_up_by,
    paymentDeadlineAt: row.payment_deadline_at,
    paymentRequestSentAt: row.payment_request_sent_at,
    rm10CardIssuanceSuppressed: Boolean(row.rm10_card_issuance_suppressed),
    rm10CardIssuanceSuppressionCode:
      row.rm10_card_issuance_suppression_code ?? null,
    items,
    complimentaryItems,
    total: calculateOrderTotal(items),
    adjustments,
    paymentAllocations,
    refunds,
    settlement,
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
  pickup_instruction,
  customer_notes,
  internal_notes,
  status,
  created_at,
  confirmation_needs_resend,
  collection_id,
  order_source,
  crew_order,
  include_receipt,
  needs_bakery_attention,
  bakery_attention_note,
  ready_at,
  ready_by,
  picked_up_at,
  picked_up_by,
  payment_deadline_at,
  payment_request_sent_at,
  rm10_card_issuance_suppressed,
  rm10_card_issuance_suppression_code,
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
  "paid",
];

/** Guest website orders only (customer_id is null). */
export async function listGuestOrders(): Promise<StorefrontOrderListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(orderSelect)
    .is("customer_id", null)
    .in("status", GUEST_STATUSES)
    .order("pickup_date", { ascending: true })
    .order("pickup_time", { ascending: true })
    .order("created_at", { ascending: true });

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
    phone: order.phone,
    cakeName: first?.cakeName ?? "—",
    sizeLabel: first?.sizeLabel ?? "—",
    additionalItemCount: Math.max(0, order.items.length - 1),
    pickupDate: order.pickupDate,
    pickupTime: order.pickupTime,
    status: order.status,
    createdAt: order.createdAt,
    confirmationNeedsResend: order.confirmationNeedsResend,
    readyAt: order.readyAt,
    pickedUpAt: order.pickedUpAt,
  };
}

async function loadOrderFinancials(orderId: string): Promise<{
  adjustments: OrderAdjustment[];
  paymentAllocations: OrderPaymentAllocationView[];
  refunds: OrderRefundView[];
}> {
  const supabase = await createClient();

  const [adjustmentsRes, allocationsRes, refundsRes] = await Promise.all([
    supabase
      .from("order_adjustments")
      .select(
        "id, order_id, kind, code, label, amount, reason, metadata, status, reverses_adjustment_id, created_at",
      )
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    supabase
      .from("payment_allocations")
      .select(
        `
        id,
        payment_id,
        order_id,
        amount,
        created_at,
        payments (
          status,
          method,
          method_description,
          paid_at,
          reference_note,
          verified_by,
          verified_at,
          created_at,
          staff_profiles!verified_by ( display_name )
        )
      `,
      )
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    supabase
      .from("refunds")
      .select(
        "id, order_id, payment_id, amount, reason, refunded_at, status, created_at",
      )
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
  ]);

  if (adjustmentsRes.error) {
    throw new Error(adjustmentsRes.error.message);
  }
  if (refundsRes.error) {
    throw new Error(refundsRes.error.message);
  }

  let allocationRows: unknown[] = allocationsRes.data ?? [];
  if (allocationsRes.error) {
    const fallback = await supabase
      .from("payment_allocations")
      .select(
        `
        id,
        payment_id,
        order_id,
        amount,
        created_at,
        payments (
          status,
          method,
          method_description,
          paid_at,
          reference_note,
          verified_by,
          verified_at,
          created_at
        )
      `,
      )
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    if (fallback.error) {
      throw new Error(fallback.error.message);
    }
    allocationRows = fallback.data ?? [];
  }

  const adjustments: OrderAdjustment[] = (adjustmentsRes.data ?? []).map(
    (row) => ({
      id: row.id as string,
      orderId: row.order_id as string,
      kind: row.kind as string,
      code: (row.code as string | null) ?? null,
      label: row.label as string,
      amount: Number(row.amount),
      reason: (row.reason as string | null) ?? null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? {},
      status: ((row.status as string | null) ?? "active") as
        | "active"
        | "reversed",
      reversesAdjustmentId:
        (row.reverses_adjustment_id as string | null) ?? null,
      createdAt: row.created_at as string,
    }),
  );

  const paymentAllocations: OrderPaymentAllocationView[] = allocationRows.flatMap(
    (raw) => {
      const row = raw as {
        id: string;
        payment_id: string;
        order_id: string;
        amount: number | string;
        created_at: string;
        payments?:
          | {
              status: string;
              method: string;
              method_description: string | null;
              paid_at: string;
              reference_note: string | null;
              verified_by: string;
              verified_at: string;
              created_at: string;
              staff_profiles?:
                | { display_name: string }
                | { display_name: string }[]
                | null;
            }
          | {
              status: string;
              method: string;
              method_description: string | null;
              paid_at: string;
              reference_note: string | null;
              verified_by: string;
              verified_at: string;
              created_at: string;
              staff_profiles?:
                | { display_name: string }
                | { display_name: string }[]
                | null;
            }[]
          | null;
      };
      const payment = relationOne(row.payments);
      if (!payment || payment.status !== "verified") return [];
      const staff = relationOne(payment.staff_profiles);
      return [
        {
          id: row.id,
          paymentId: row.payment_id,
          orderId: row.order_id,
          amount: Number(row.amount),
          paymentStatus: "verified" as const,
          method: payment.method as PaymentMethodCode,
          methodDescription: payment.method_description,
          paidAt: payment.paid_at,
          referenceNote: payment.reference_note,
          verifiedBy: payment.verified_by,
          verifiedByName: staff?.display_name ?? null,
          verifiedAt: payment.verified_at,
          createdAt: row.created_at ?? payment.created_at,
        },
      ];
    },
  );

  const refunds: OrderRefundView[] = (refundsRes.data ?? []).map((row) => ({
    id: row.id as string,
    orderId: row.order_id as string,
    paymentId: (row.payment_id as string | null) ?? null,
    amount: Number(row.amount),
    reason: (row.reason as string | null) ?? null,
    refundedAt: row.refunded_at as string,
    status: "recorded" as const,
    createdAt: row.created_at as string,
  }));

  return { adjustments, paymentAllocations, refunds };
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

  const financial = await loadOrderFinancials(id);
  return mapOrder(data as unknown as OrderRow, financial);
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
