import { cache } from "react";
import { parseBusinessDate, toBusinessDateKey } from "@/lib/dates";
import { isTransientDataLoadError } from "@/lib/supabase/fetch-timeout";
import { ProductionCapacityPanel } from "@/workspaces/library/order-availability/capacity/ProductionCapacityPanel";
import {
  listProductionCapacityCakesForPickupDate,
  listProductionCapacityForDate,
  listRecentProductionCapacityEvents,
  type ProductionCapacityCakeOption,
  type ProductionCapacityEvent,
  type ProductionCapacityRow,
} from "@/workspaces/library/order-availability/capacity/queries";

type ProductionCapacitySectionProps = {
  dateParam?: string;
  month: string;
  canMutate: boolean;
  canConfigureWaitingList: boolean;
};

export function resolveCapacityDate(
  dateParam: string | undefined,
  month: string,
): string {
  const fromQuery = dateParam?.trim().slice(0, 10) ?? "";
  if (parseBusinessDate(fromQuery)) return fromQuery;
  const today = toBusinessDateKey();
  if (today.startsWith(`${month}-`)) return today;
  return `${month}-01`;
}

function isCapacityLoadFailure(message: string): boolean {
  return (
    /production_capacity|schema cache|does not exist/i.test(message) ||
    isTransientDataLoadError(message)
  );
}

export const loadProductionCapacityWorkspace = cache(
  async (
    dateParam: string | undefined,
    month: string,
  ): Promise<{
    pickupDate: string;
    cakes: ProductionCapacityCakeOption[];
    hasApplicableCollection: boolean;
    rows: ProductionCapacityRow[];
    events: ProductionCapacityEvent[];
    loadError: string | null;
  }> => {
    const pickupDate = resolveCapacityDate(dateParam, month);
    let cakes: ProductionCapacityCakeOption[] = [];
    let hasApplicableCollection = false;
    let rows: ProductionCapacityRow[] = [];
    let events: ProductionCapacityEvent[] = [];
    let loadError: string | null = null;

    try {
      const [capacityRows, capacityEvents] = await Promise.all([
        listProductionCapacityForDate(pickupDate),
        listRecentProductionCapacityEvents(pickupDate),
      ]);
      rows = capacityRows;
      events = capacityEvents;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!isCapacityLoadFailure(message)) throw error;
      loadError =
        "Could not load production capacity for this date. Reload to try again.";
    }

    try {
      const catalog = await listProductionCapacityCakesForPickupDate(pickupDate);
      cakes = catalog.cakes;
      hasApplicableCollection = Boolean(catalog.collectionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!isCapacityLoadFailure(message)) throw error;
      cakes = [];
      hasApplicableCollection = false;
    }

    return {
      pickupDate,
      cakes,
      hasApplicableCollection,
      rows,
      events,
      loadError,
    };
  },
);

export async function ProductionCapacitySection({
  dateParam,
  month,
  canMutate,
  canConfigureWaitingList,
}: ProductionCapacitySectionProps) {
  const { cakes, hasApplicableCollection, rows, loadError } =
    await loadProductionCapacityWorkspace(dateParam, month);
  const pickupDate = resolveCapacityDate(dateParam, month);

  return (
    <div className="space-y-4">
      {loadError ? <p className="text-skyline text-sm">{loadError}</p> : null}
      <ProductionCapacityPanel
        cakes={cakes}
        canMutate={canMutate}
        canConfigureWaitingList={canConfigureWaitingList}
        hasApplicableCollection={hasApplicableCollection}
        key={pickupDate}
        pickupDate={pickupDate}
        rows={rows}
      />
    </div>
  );
}
