import "server-only";
import { requireStaff } from "@/foundation/auth/session";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildMonthlyReport,
  isReportOwner,
  nextMonth,
  orderFinancials,
  previousMonth,
  reportOrderSourceLabel,
  summarizeCash,
  type ReportOrder,
  type ReportMethod,
} from "@/engines/reports/monthly";
import {
  assertRefundBreakdownReconciles,
  managementRefundMonthBounds,
  mapRefundBreakdownEntry,
} from "@/engines/reports/refund-breakdown";

type Client = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

export async function requireReportOwner() {
  const staff = await requireStaff();
  if (!isReportOwner(staff.role.code)) throw new Error("Owner access required");
  return staff;
}

type RangeQuery = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
async function allRows(query: () => RangeQuery): Promise<Row[]> {
  const result: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query().range(offset, offset + 499);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as Row[];
    result.push(...batch);
    if (batch.length < 500) return result;
  }
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const number = (value: unknown) => Number(value ?? 0);
const nullable = (value: unknown) => (typeof value === "string" ? value : null);
const group = (rows: Row[], key: string) => {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const id = text(row[key]);
    map.set(id, [...(map.get(id) ?? []), row]);
  }
  return map;
};

async function loadOrders(client: Client, month: string): Promise<Row[]> {
  return allRows(() =>
    client
      .from("orders")
      .select(
        "id,pickup_date,created_at,fulfilment_method,status,order_source,order_source_other,extra_stock_id,picked_up_at,delivered_at",
      )
      .gte("pickup_date", `${month}-01`)
      .lt("pickup_date", `${nextMonth(month)}-01`)
      .order("id"),
  );
}

async function loadRelated(
  client: Client,
  orders: Row[],
): Promise<ReportOrder[]> {
  const ids = [...new Set(orders.map((row) => text(row.id)))];
  const items: Row[] = [],
    addons: Row[] = [],
    adjustments: Row[] = [],
    allocations: Row[] = [],
    refunds: Row[] = [],
    deliveries: Row[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const results = await Promise.all([
      allRows(() =>
        client
          .from("order_items")
          .select("order_id,cake_name,size_label,quantity,unit_price")
          .in("order_id", batch)
          .order("id"),
      ),
      allRows(() =>
        client
          .from("order_paid_addons")
          .select("order_id,quantity,unit_price")
          .in("order_id", batch)
          .order("id"),
      ),
      allRows(() =>
        client
          .from("order_adjustments")
          .select(
            "order_id,amount,kind,code,label,reason,status,reverses_adjustment_id",
          )
          .in("order_id", batch)
          .order("id"),
      ),
      allRows(() =>
        client
          .from("payment_allocations")
          .select("id,order_id,amount,payments(status,method,paid_at)")
          .in("order_id", batch)
          .order("id"),
      ),
      allRows(() =>
        client
          .from("refunds")
          .select("order_id,amount,status,refunded_at")
          .in("order_id", batch)
          .order("id"),
      ),
      allRows(() =>
        client
          .from("order_delivery_details")
          .select(
            "order_id,delivery_fee_status,delivery_fee_quoted_amount,delivery_fee_waived",
          )
          .in("order_id", batch)
          .order("order_id"),
      ),
    ]);
    items.push(...results[0]);
    addons.push(...results[1]);
    adjustments.push(...results[2]);
    allocations.push(...results[3]);
    refunds.push(...results[4]);
    deliveries.push(...results[5]);
  }
  const correctionIds = allocations.map((row) => text(row.id));
  const corrections: Row[] = [];
  for (let i = 0; i < correctionIds.length; i += 100) {
    corrections.push(
      ...(await allRows(() =>
        client
          .from("payment_corrections")
          .select("payment_allocation_id,corrected_amount,corrected_method")
          .in("payment_allocation_id", correctionIds.slice(i, i + 100))
          .order("payment_allocation_id"),
      )),
    );
  }
  const correctionById = new Map(
    corrections.map((row) => [text(row.payment_allocation_id), row]),
  );
  const itemMap = group(items, "order_id"),
    addonMap = group(addons, "order_id"),
    adjMap = group(adjustments, "order_id"),
    allocMap = group(allocations, "order_id"),
    refundMap = group(refunds, "order_id");
  const deliveryMap = new Map(
    deliveries.map((row) => [text(row.order_id), row]),
  );
  return orders.map((row) => {
    const id = text(row.id);
    const method = text(row.fulfilment_method);
    if (
      method !== "pickup" &&
      method !== "delivery" &&
      method !== "dine_in" &&
      method !== "drive_through"
    )
      throw new Error(`Unsupported fulfilment method on order ${id}`);
    const delivery = deliveryMap.get(id);
    const deliveryConcession =
      delivery &&
      (delivery.delivery_fee_waived === true ||
        delivery.delivery_fee_status === "quoted_waived")
        ? number(delivery.delivery_fee_quoted_amount)
        : 0;
    return {
      id,
      pickupDate: text(row.pickup_date),
      createdAt: text(row.created_at),
      method: (method === "drive_through" ? "pickup" : method) as ReportMethod,
      status: text(row.status),
      source: reportOrderSourceLabel(
        text(row.order_source),
        nullable(row.order_source_other),
      ),
      extraStockId: nullable(row.extra_stock_id),
      deliveryConcession,
      pickedUpAt: nullable(row.picked_up_at),
      deliveredAt: nullable(row.delivered_at),
      items: (itemMap.get(id) ?? []).map((item) => ({
        cakeName: text(item.cake_name),
        sizeLabel: text(item.size_label),
        quantity: number(item.quantity),
        unitPrice: number(item.unit_price),
      })),
      addons: (addonMap.get(id) ?? []).map((item) => ({
        quantity: number(item.quantity),
        unitPrice: number(item.unit_price),
      })),
      adjustments: (adjMap.get(id) ?? []).map((item) => ({
        amount: number(item.amount),
        kind: text(item.kind),
        code: nullable(item.code),
        label: text(item.label),
        reason: nullable(item.reason),
        status: text(item.status),
        reversesAdjustmentId: nullable(item.reverses_adjustment_id),
      })),
      allocations: (allocMap.get(id) ?? []).map((item) => {
        const payment = Array.isArray(item.payments)
          ? (item.payments[0] as Row | undefined)
          : (item.payments as Row | null);
        const correction = correctionById.get(text(item.id));
        return {
          amount: number(item.amount),
          effectiveAmount: correction
            ? number(correction.corrected_amount)
            : number(item.amount),
          status: text(payment?.status),
          method: text(correction?.corrected_method ?? payment?.method),
          paidAt: text(payment?.paid_at),
        };
      }),
      refunds: (refundMap.get(id) ?? []).map((item) => ({
        amount: number(item.amount),
        status: text(item.status),
        refundedAt: text(item.refunded_at),
      })),
    };
  });
}

export async function loadManagementReport(month: string) {
  await requireReportOwner();
  const client = await createClient();
  const prior = previousMonth(month);
  const [currentRows, priorRows] = await Promise.all([
    loadOrders(client, month),
    loadOrders(client, prior),
  ]);
  const orders = await loadRelated(client, [...currentRows, ...priorRows]);
  const current = buildMonthlyReport(orders, month);
  const previous = buildMonthlyReport(orders, prior);
  const bounds = managementRefundMonthBounds(month);
  const bookings = await allRows(() =>
    client
      .from("orders")
      .select(
        "id,order_source,order_source_other,status,pickup_date,created_at,fulfilment_method,extra_stock_id,picked_up_at,delivered_at",
      )
      .gte("created_at", bounds.start)
      .lt("created_at", bounds.end)
      .order("id"),
  );
  const bookingOrders = await loadRelated(client, bookings);
  const bookingValue = bookingOrders.reduce(
    (total, order) =>
      total +
      (order.status === "cancelled"
        ? 0
        : orderFinancials(order).settlement.amountDue),
    0,
  );
  const paymentRows = await allRows(() =>
    client
      .from("payments")
      .select("id,paid_at,status,method")
      .gte("paid_at", bounds.start)
      .lt("paid_at", bounds.end)
      .order("id"),
  );
  const paymentIds = paymentRows.map((row) => text(row.id));
  const paymentAllocations: Row[] = [];
  for (let i = 0; i < paymentIds.length; i += 100)
    paymentAllocations.push(
      ...(await allRows(() =>
        client
          .from("payment_allocations")
          .select("id,payment_id,amount")
          .in("payment_id", paymentIds.slice(i, i + 100))
          .order("id"),
      )),
    );
  const correctionIds = paymentAllocations.map((row) => text(row.id));
  const corrections: Row[] = [];
  for (let i = 0; i < correctionIds.length; i += 100)
    corrections.push(
      ...(await allRows(() =>
        client
          .from("payment_corrections")
          .select("payment_allocation_id,corrected_amount,corrected_method")
          .in("payment_allocation_id", correctionIds.slice(i, i + 100))
          .order("payment_allocation_id"),
      )),
    );
  const correctionMap = new Map(
    corrections.map((row) => [text(row.payment_allocation_id), row]),
  );
  const paymentMap = new Map(paymentRows.map((row) => [text(row.id), row]));
  const cashAllocations = paymentAllocations.flatMap((allocation) => {
    const payment = paymentMap.get(text(allocation.payment_id));
    if (!payment) throw new Error("Payment allocation has no payment record");
    const correction = correctionMap.get(text(allocation.id));
    return [
      {
        amount: number(allocation.amount),
        effectiveAmount: number(
          correction?.corrected_amount ?? allocation.amount,
        ),
        status: text(payment.status),
        method: text(correction?.corrected_method ?? payment.method),
        paidAt: text(payment.paid_at),
      },
    ];
  });
  const refundRows = await allRows(() =>
    client
      .from("refunds")
      .select(
        "id,order_id,amount,status,refunded_at,refund_method,refund_method_description,refund_type,reason,created_by",
      )
      .gte("refunded_at", bounds.start)
      .lt("refunded_at", bounds.end)
      .order("id"),
  );
  const cash = summarizeCash(
    cashAllocations,
    refundRows.map((row) => ({
      amount: number(row.amount),
      status: text(row.status),
      refundedAt: "",
    })),
  );
  const recordedRefundRows = refundRows.filter(
    (row) => text(row.status) === "recorded",
  );
  const refundOrderIds = [...
    new Set(recordedRefundRows.map((row) => text(row.order_id)).filter(Boolean)),
  ];
  const refundOrders: Row[] = [];
  for (let i = 0; i < refundOrderIds.length; i += 100) {
    refundOrders.push(
      ...(await allRows(() =>
        client
          .from("orders")
          .select("id,order_number")
          .in("id", refundOrderIds.slice(i, i + 100))
          .order("id"),
      )),
    );
  }
  const orderNumberById = new Map(
    refundOrders.map((row) => [text(row.id), text(row.order_number)]),
  );
  const refundActorIds = [
    ...new Set(
      recordedRefundRows
        .map((row) => nullable(row.created_by))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const actorNameById = new Map<string, string>();
  let actorLookupFailed = false;
  if (refundActorIds.length > 0) {
    try {
      // Resolve only actors on refunds already visible to the authorized
      // report query. Do not widen staff_profiles RLS or fetch private fields.
      const admin = createServiceClient();
      for (let i = 0; i < refundActorIds.length; i += 100) {
        const { data, error } = await admin
          .from("staff_profiles")
          .select("id,display_name")
          .in("id", refundActorIds.slice(i, i + 100));
        if (error) {
          actorLookupFailed = true;
          break;
        }
        for (const staff of data ?? []) {
          const name = String(staff.display_name ?? "").trim();
          if (name) actorNameById.set(String(staff.id), name);
        }
      }
    } catch {
      actorLookupFailed = true;
    }
  }
  const refundBreakdown = recordedRefundRows.map((row) => {
    const orderId = text(row.order_id);
    const orderNumber = orderNumberById.get(orderId);
    if (!orderNumber)
      throw new Error("Recorded refund has no visible order number");
    const actorId = nullable(row.created_by);
    const recordedBy = actorId
      ? actorNameById.get(actorId) ??
        (actorLookupFailed ? "Name unavailable" : "Staff")
      : "Staff";
    return mapRefundBreakdownEntry(
      {
        amount: number(row.amount),
        refundedAt: text(row.refunded_at),
        refundMethod: nullable(row.refund_method),
        refundMethodDescription: nullable(row.refund_method_description),
        refundType: nullable(row.refund_type),
        reason: nullable(row.reason),
      },
      orderNumber,
      recordedBy,
    );
  });
  assertRefundBreakdownReconciles(refundBreakdown, cash.refunds);
  return {
    current,
    previous,
    bookings: {
      count: bookings.length,
      value: Math.round(bookingValue * 100) / 100,
      sources: [...new Set(bookings.map((row) =>
        reportOrderSourceLabel(
          text(row.order_source),
          nullable(row.order_source_other),
        ),
      ))].map((source) => ({
        source,
        count: bookings.filter((row) =>
          reportOrderSourceLabel(
            text(row.order_source),
            nullable(row.order_source_other),
          ) === source,
        ).length,
      })),
    },
    payments: cash,
    refundBreakdown,
    asOf: new Date().toISOString(),
  };
}
