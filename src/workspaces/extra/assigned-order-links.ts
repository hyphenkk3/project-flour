export type AssignedOrderSummary = {
  id: string;
  order_number: string;
  guest_name: string | null;
  extra_stock_id?: string | null;
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
