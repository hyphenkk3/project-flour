export type AssignedOrderSummary = {
  id: string;
  order_number: string;
  guest_name: string | null;
};

export function mapAssignedOrderSummariesByStock(
  stockRows: Array<{ id: string; order_id: string | null }>,
  orders: AssignedOrderSummary[],
): Map<string, AssignedOrderSummary> {
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const summariesByStock = new Map<string, AssignedOrderSummary>();

  for (const stock of stockRows) {
    if (!stock.order_id) continue;
    const order = ordersById.get(stock.order_id);
    if (order) summariesByStock.set(stock.id, order);
  }

  return summariesByStock;
}
