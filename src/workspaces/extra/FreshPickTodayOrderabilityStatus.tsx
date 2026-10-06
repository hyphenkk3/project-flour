import { formatBusinessCalendarDate } from "@/lib/dates";
import type { FreshPickTodayOrderability } from "@/engines/extra/fresh-picks-fulfilment";
import type { CustomerWebsiteFulfilmentMethod } from "@/engines/orders/fulfilment";
import { freshPickTodayStatusLabel } from "@/engines/extra/home-fresh-picks";

const METHOD_LABELS: Record<CustomerWebsiteFulfilmentMethod, string> = {
  pickup: "Pickup",
  dine_in: "Dine-in",
  delivery: "Delivery",
};

export function FreshPickTodayOrderabilityStatus({
  availability,
  readyForCollection,
  walkInHeld,
}: {
  availability: FreshPickTodayOrderability | null | undefined;
  readyForCollection: boolean;
  walkInHeld: boolean;
}) {
  if (!availability) return null;

  const availableToday =
    !walkInHeld && availability.availableMethods.length > 0;
  const label = freshPickTodayStatusLabel({
    readyForCollection,
    availableToday,
  });
  const nextAvailableDate =
    !availableToday && !walkInHeld ? availability.nextAvailableDate : null;
  const methods = availableToday
    ? availability.availableMethods.map((method) => METHOD_LABELS[method])
    : [];

  return (
    <div className="border-fog bg-mist mt-2 rounded-lg border px-3 py-2">
      <p className="text-ink text-xs font-bold tracking-wide">{label}</p>
      {methods.length > 0 ? (
        <p className="text-skyline mt-0.5 text-xs">{methods.join(" · ")}</p>
      ) : null}
      {nextAvailableDate ? (
        <p className="text-skyline mt-0.5 text-xs">
          Next available: {formatBusinessCalendarDate(nextAvailableDate)}
        </p>
      ) : null}
    </div>
  );
}
