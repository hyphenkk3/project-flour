export type AssignedOrderSummary = {
  id: string;
  order_number: string;
  guest_name: string | null;
  customers?: { full_name: string | null } | { full_name: string | null }[] | null;
  extra_stock_id?: string | null;
  status?: string | null;
  order_source?: string | null;
  customer_id?: string | null;
  fulfilment_method?: string | null;
  pickup_date?: string | null;
  ready_at?: string | null;
  picked_up_at?: string | null;
  out_for_delivery_at?: string | null;
  delivered_at?: string | null;
  created_at?: string | null;
};

export type AssignedStockOrder = AssignedOrderSummary & {
  readinessLinkVerified: boolean;
};

export function mapAssignedOrderSummariesByStock(
  stockRows: Array<{ id: string; order_id: string | null }>,
  orders: AssignedOrderSummary[],
): Map<string, AssignedStockOrder> {
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const ordersByPrimaryStockId = new Map(
    orders.flatMap((order) =>
      order.extra_stock_id ? [[order.extra_stock_id, order] as const] : [],
    ),
  );
  const summariesByStock = new Map<string, AssignedStockOrder>();

  for (const stock of stockRows) {
    const hasPerStockOrderLink = Boolean(stock.order_id);
    const order = stock.order_id
      ? ordersById.get(stock.order_id)
      : ordersByPrimaryStockId.get(stock.id);
    if (order) {
      summariesByStock.set(stock.id, {
        ...order,
        readinessLinkVerified: hasPerStockOrderLink,
      });
    }
  }

  return summariesByStock;
}
