import { parseBusinessDate, toBusinessDateKey } from "@/lib/dates";
import { listCakes } from "@/workspaces/library/cakes/queries";
import { ProductionCapacityPanel } from "@/workspaces/library/order-availability/capacity/ProductionCapacityPanel";
import {
  listProductionCapacityForDate,
  listRecentProductionCapacityEvents,
  type ProductionCapacityCakeOption,
} from "@/workspaces/library/order-availability/capacity/queries";

type ProductionCapacitySectionProps = {
  dateParam?: string;
  month: string;
  canMutate: boolean;
  canConfigureWaitingList: boolean;
};

function resolveCapacityDate(dateParam: string | undefined, month: string): string {
  const fromQuery = dateParam?.trim().slice(0, 10) ?? "";
  if (parseBusinessDate(fromQuery)) return fromQuery;
  const today = toBusinessDateKey();
  if (today.startsWith(`${month}-`)) return today;
  return `${month}-01`;
}

export async function ProductionCapacitySection({
  dateParam,
  month,
  canMutate,
  canConfigureWaitingList,
}: ProductionCapacitySectionProps) {
  const pickupDate = resolveCapacityDate(dateParam, month);

  let cakes: ProductionCapacityCakeOption[] = [];
  let rows: Awaited<ReturnType<typeof listProductionCapacityForDate>> = [];
  let events: Awaited<ReturnType<typeof listRecentProductionCapacityEvents>> =
    [];

  try {
    rows = await listProductionCapacityForDate(pickupDate);
    events = await listRecentProductionCapacityEvents(pickupDate);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/production_capacity|schema cache|does not exist/i.test(message)) {
      throw error;
    }
  }

  try {
    cakes = (await listCakes())
      .filter((cake) => cake.status === "active" || cake.status === "seasonal")
      .map((cake) => ({
        id: cake.id,
        name: cake.name,
        sizes: cake.sizes.map((size) => ({ id: size.id, label: size.label })),
      }));
  } catch {
    cakes = [];
  }

  return (
    <ProductionCapacityPanel
      cakes={cakes}
      canMutate={canMutate}
      canConfigureWaitingList={canConfigureWaitingList}
      events={events}
      hrefBase="/bakery/availability"
      month={month}
      pickupDate={pickupDate}
      rows={rows}
    />
  );
}
