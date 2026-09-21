import { loadProductionCapacityWorkspace } from "@/workspaces/library/order-availability/capacity/ProductionCapacitySection";
import { ProductionCapacityHistory } from "@/workspaces/library/order-availability/capacity/ProductionCapacityHistory";

type ProductionCapacityHistorySectionProps = {
  dateParam?: string;
  month: string;
};

export async function ProductionCapacityHistorySection({
  dateParam,
  month,
}: ProductionCapacityHistorySectionProps) {
  const { events } = await loadProductionCapacityWorkspace(dateParam, month);

  return (
    <div className="space-y-4">
      <p className="text-skyline max-w-2xl text-sm">
        Latest production-capacity saves for this pickup date.
      </p>
      <ProductionCapacityHistory events={events} />
    </div>
  );
}
