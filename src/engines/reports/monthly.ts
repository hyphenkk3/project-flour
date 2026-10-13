import { calculateOrderSettlement } from "@/engines/orders/settlement";

export type ReportMethod = "pickup" | "delivery" | "dine_in";
export type ReportItem = {
  cakeName: string;
  sizeLabel: string;
  quantity: number;
  unitPrice: number;
};
export type ReportAdjustment = {
  amount: number;
  kind: string;
  code: string | null;
  label: string;
  reason: string | null;
  status: string;
  reversesAdjustmentId: string | null;
};
export type ReportAllocation = {
  amount: number;
  effectiveAmount: number;
  status: string;
  method: string;
  paidAt: string;
};
export type ReportRefund = {
  amount: number;
  status: string;
  refundedAt: string;
};
export type ReportOrder = {
  id: string;
  pickupDate: string;
  createdAt: string;
  method: ReportMethod;
  status: string;
  source: string;
  extraStockId: string | null;
  deliveryConcession: number;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  items: ReportItem[];
  addons: Array<{ quantity: number; unitPrice: number }>;
  adjustments: ReportAdjustment[];
  allocations: ReportAllocation[];
  refunds: ReportRefund[];
};

const cents = (value: number) => Math.round(value * 100);
const money = (value: number) => Math.round(value) / 100;
const roundedCurrency = (value: number) => cents(value) / 100;
const sum = (values: number[]) =>
  money(values.reduce((a, b) => a + cents(b), 0));

export function isReportOwner(role: string | null | undefined): boolean {
  return role === "owner";
}

export function reportMonth(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuching",
    year: "numeric",
    month: "2-digit",
  })
    .format(date)
    .slice(0, 7);
}

export function previousMonth(month: string): string {
  const [year, number] = month.split("-").map(Number);
  if (!year || !number || number < 1 || number > 12)
    throw new Error("Invalid report month");
  return `${number === 1 ? year - 1 : year}-${String(number === 1 ? 12 : number - 1).padStart(2, "0")}`;
}

export function nextMonth(month: string): string {
  const [year, number] = month.split("-").map(Number);
  if (!year || !number || number < 1 || number > 12)
    throw new Error("Invalid report month");
  return `${number === 12 ? year + 1 : year}-${String(number === 12 ? 1 : number + 1).padStart(2, "0")}`;
}

export function reportFulfilled(order: ReportOrder): boolean {
  if (order.status === "cancelled") return false;
  return order.method === "delivery"
    ? Boolean(order.deliveredAt)
    : Boolean(order.pickedUpAt);
}

export function classifyAdjustment(
  row: ReportAdjustment,
): "discount" | "delivery" | "processing" | "other" | "reversal" {
  if (
    row.status !== "active" ||
    row.reversesAdjustmentId ||
    row.kind === "reversal"
  )
    return "reversal";
  if (row.code === "delivery_fee") return "delivery";
  if (row.code === "delivery_processing_fee") return "processing";
  if (
    row.amount < 0 &&
    (row.kind === "promotion" ||
      row.kind === "discount" ||
      row.code === "rm10_physical_card")
  )
    return "discount";
  return "other";
}

export function orderFinancials(order: ReportOrder) {
  const cakeGross = sum(
    order.items.map((item) => item.unitPrice * item.quantity),
  );
  const addonGross = sum(
    order.addons.map((item) => item.unitPrice * item.quantity),
  );
  const grossProducts = sum([cakeGross, addonGross]);
  const effective = order.adjustments.filter(
    (row) => classifyAdjustment(row) !== "reversal",
  );
  const discounts = sum(
    effective
      .filter((row) => classifyAdjustment(row) === "discount")
      .map((row) => -row.amount),
  );
  const delivery = sum(
    effective
      .filter((row) => classifyAdjustment(row) === "delivery")
      .map((row) => row.amount),
  );
  const processing = sum(
    effective
      .filter((row) => classifyAdjustment(row) === "processing")
      .map((row) => row.amount),
  );
  const other = sum(
    effective
      .filter((row) => classifyAdjustment(row) === "other")
      .map((row) => row.amount),
  );
  const settlement = calculateOrderSettlement({
    items: [...order.items, ...order.addons].map((row) => ({
      unitPrice: row.unitPrice,
      quantity: row.quantity,
    })),
    adjustments: order.adjustments.map((row) => ({ amount: row.amount })),
    allocations: order.allocations
      .filter((row) => row.status === "verified")
      .map((row) => ({
        amount: row.amount,
        effectiveAmount: row.effectiveAmount,
        paymentStatus: "verified" as const,
      })),
    refunds: order.refunds
      .filter((row) => row.status === "recorded")
      .map((row) => ({ amount: row.amount, status: "recorded" as const })),
  });
  const netProducts = sum([grossProducts, -discounts]);
  const grossSales = sum([grossProducts, delivery, processing, other]);
  const netSales = Math.max(0, sum([netProducts, delivery, processing, other]));
  return {
    cakeGross,
    addonGross,
    grossProducts,
    grossSales,
    discounts,
    netProducts,
    delivery,
    processing,
    other,
    netSales,
    reconciliation: roundedCurrency(netSales - settlement.amountDue),
    outstandingNow: settlement.remainingBalance,
    settlement,
  };
}

export function percentChange(
  current: number,
  previous: number,
): number | null {
  return previous === 0
    ? null
    : Math.round(((current - previous) / previous) * 1000) / 10;
}

export function summarizeCash(
  allocations: ReportAllocation[],
  refunds: ReportRefund[],
) {
  const verified = allocations.filter((row) => row.status === "verified");
  const methods = [...new Set(verified.map((row) => row.method))]
    .sort()
    .map((method) => ({
      method,
      value: sum(
        verified
          .filter((row) => row.method === method)
          .map((row) => row.effectiveAmount),
      ),
    }));
  return {
    collected: sum(verified.map((row) => row.effectiveAmount)),
    methods,
    refunds: sum(
      refunds
        .filter((row) => row.status === "recorded")
        .map((row) => row.amount),
    ),
  };
}

export function buildMonthlyReport(orders: ReportOrder[], month: string) {
  const selected = orders.filter((order) =>
    order.pickupDate.startsWith(`${month}-`),
  );
  const fulfilled = selected.filter(reportFulfilled);
  const unfulfilled = selected.filter(
    (order) => order.status !== "cancelled" && !reportFulfilled(order),
  );
  const cancelled = selected.filter((order) => order.status === "cancelled");
  const financials = fulfilled.map(orderFinancials);
  const total = (key: keyof ReturnType<typeof orderFinancials>) =>
    sum(financials.map((row) => Number(row[key])));
  const methods = (["pickup", "delivery", "dine_in"] as const).map((method) => {
    const rows = selected.filter((order) => order.method === method);
    const done = rows.filter(reportFulfilled);
    const values = done.map(orderFinancials);
    const netSales = sum(values.map((row) => row.netSales));
    return {
      method,
      scheduled: rows.length,
      fulfilled: done.length,
      unfulfilled: rows.filter(
        (row) => row.status !== "cancelled" && !reportFulfilled(row),
      ).length,
      cancelled: rows.filter((row) => row.status === "cancelled").length,
      gross: sum(values.map((row) => row.grossSales)),
      discounts: sum(values.map((row) => row.discounts)),
      netSales,
      aov: done.length ? roundedCurrency(netSales / done.length) : 0,
      cakeQuantity: done.reduce(
        (n, row) => n + row.items.reduce((m, item) => m + item.quantity, 0),
        0,
      ),
      deliveryCharges: sum(values.map((row) => row.delivery)),
      deliveryConcessions: sum(done.map((row) => row.deliveryConcession)),
    };
  });
  const cakeMap = new Map<
    string,
    { cakeName: string; sizeLabel: string; quantity: number; revenue: number }
  >();
  for (const order of fulfilled)
    for (const item of order.items) {
      const key = JSON.stringify([item.cakeName, item.sizeLabel]);
      const row = cakeMap.get(key) ?? {
        cakeName: item.cakeName,
        sizeLabel: item.sizeLabel,
        quantity: 0,
        revenue: 0,
      };
      row.quantity += item.quantity;
      row.revenue = sum([row.revenue, item.quantity * item.unitPrice]);
      cakeMap.set(key, row);
    }
  const cakes = [...cakeMap.values()].sort(
    (a, b) => b.quantity - a.quantity || a.cakeName.localeCompare(b.cakeName),
  );
  const sizeMap = new Map<
    string,
    { sizeLabel: string; quantity: number; revenue: number }
  >();
  for (const cake of cakes) {
    const row = sizeMap.get(cake.sizeLabel) ?? {
      sizeLabel: cake.sizeLabel,
      quantity: 0,
      revenue: 0,
    };
    row.quantity += cake.quantity;
    row.revenue = sum([row.revenue, cake.revenue]);
    sizeMap.set(cake.sizeLabel, row);
  }
  const sizes = [...sizeMap.values()].sort(
    (a, b) => b.quantity - a.quantity || a.sizeLabel.localeCompare(b.sizeLabel),
  );
  const sources = [...new Set(selected.map((row) => row.source))]
    .sort()
    .map((source) => {
      const rows = selected.filter((row) => row.source === source);
      const done = rows.filter(reportFulfilled);
      return {
        source,
        orders: rows.length,
        fulfilled: done.length,
        netSales: sum(done.map((row) => orderFinancials(row).netSales)),
      };
    });
  const discounts = new Map<
    string,
    { reason: string; count: number; value: number }
  >();
  for (const order of fulfilled)
    for (const row of order.adjustments)
      if (classifyAdjustment(row) === "discount") {
        const reason = row.reason || row.code || "Unspecified";
        const item = discounts.get(reason) ?? { reason, count: 0, value: 0 };
        item.count++;
        item.value = sum([item.value, -row.amount]);
        discounts.set(reason, item);
      }
  const netSales = total("netSales");
  return {
    month,
    scheduled: selected.length,
    fulfilled: fulfilled.length,
    unfulfilled: unfulfilled.length,
    cancelled: cancelled.length,
    gross: total("grossSales"),
    grossProducts: total("grossProducts"),
    discounts: total("discounts"),
    netProducts: total("netProducts"),
    delivery: total("delivery"),
    processing: total("processing"),
    other: total("other"),
    netSales,
    aov: fulfilled.length ? roundedCurrency(netSales / fulfilled.length) : 0,
    unfulfilledValue: sum(
      unfulfilled.map((row) => orderFinancials(row).netSales),
    ),
    cancelledValue: sum(cancelled.map((row) => orderFinancials(row).netSales)),
    outstandingNow: sum(
      selected
        .filter((row) => row.status !== "cancelled")
        .map((row) => orderFinancials(row).outstandingNow),
    ),
    cakeQuantity: cakes.reduce((n, row) => n + row.quantity, 0),
    cakes,
    sizes,
    methods,
    sources,
    freshPicks: {
      orders: fulfilled.filter((row) => row.extraStockId).length,
      netSales: sum(
        fulfilled
          .filter((row) => row.extraStockId)
          .map((row) => orderFinancials(row).netSales),
      ),
    },
    discountedOrders: fulfilled.filter((row) =>
      row.adjustments.some((adj) => classifyAdjustment(adj) === "discount"),
    ).length,
    discountReasons: [...discounts.values()].sort((a, b) => b.value - a.value),
    reconciliation: sum(financials.map((row) => row.reconciliation)),
  };
}
