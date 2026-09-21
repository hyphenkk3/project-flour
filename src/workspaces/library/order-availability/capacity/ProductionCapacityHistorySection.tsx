import { loadProductionCapacityWorkspace } from "@/workspaces/library/order-availability/capacity/ProductionCapacitySection";
import { ProductionCapacityHistory } from "@/workspaces/library/order-availability/capacity/ProductionCapacityHistory";
import { AVAILABILITY_RECENT_SECTION_ID } from "@/workspaces/library/order-availability/availability-sections";

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
    <section
      aria-labelledby={AVAILABILITY_RECENT_SECTION_ID}
      className="space-y-4"
    >
      <div>
        <h2
          className="text-ink scroll-mt-32 text-lg font-semibold tracking-tight"
          id={AVAILABILITY_RECENT_SECTION_ID}
        >
          Recent capacity changes
        </h2>
        <p className="text-skyline mt-1 max-w-2xl text-sm">
          Latest production-capacity saves for this pickup date.
        </p>
      </div>
      <ProductionCapacityHistory events={events} />
    </section>
  );
}
