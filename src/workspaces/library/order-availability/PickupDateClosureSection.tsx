import { PickupDateClosureCard } from "@/workspaces/library/order-availability/PickupDateClosureCard";
import { getOrderAvailabilityDay } from "@/workspaces/library/order-availability/queries";
import { isTransientDataLoadError } from "@/lib/supabase/fetch-timeout";

type PickupDateClosureSectionProps = {
  pickupDate: string;
  canMutate: boolean;
};

export async function PickupDateClosureSection({
  pickupDate,
  canMutate,
}: PickupDateClosureSectionProps) {
  const day = await getOrderAvailabilityDay(pickupDate).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (
      /order_availability_override|schema cache|does not exist/i.test(message) ||
      isTransientDataLoadError(message)
    ) {
      return { pickupDate, closed: false, note: null };
    }
    throw error;
  });

  return <PickupDateClosureCard canMutate={canMutate} day={day} />;
}
