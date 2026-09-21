import { loadProductionCapacityWorkspace } from "@/workspaces/library/order-availability/capacity/ProductionCapacitySection";
import { WaitingListAvailabilityCard } from "@/workspaces/library/order-availability/WaitingListAvailabilityCard";

type WaitingListAvailabilitySectionProps = {
  dateParam?: string;
  month: string;
};

export async function WaitingListAvailabilitySection({
  dateParam,
  month,
}: WaitingListAvailabilitySectionProps) {
  const { pickupDate, rows } = await loadProductionCapacityWorkspace(
    dateParam,
    month,
  );

  return <WaitingListAvailabilityCard pickupDate={pickupDate} rows={rows} />;
}
