import type { ReactNode } from "react";
import {
  homepageFreshPicksAvailabilityLines,
  homepageFreshPicksCountCopy,
  homepageFreshPicksDescription,
  homepageFreshPicksHorizon,
  type FreshPickDay,
} from "@/engines/extra/customer-fresh-picks";
import { toBusinessDateKey } from "@/lib/dates";
import { HomeDestinationCard } from "@/workspaces/storefront/home/HomeDestinationCard";

type StorefrontFreshPicksCardProps = {
  days: readonly FreshPickDay[];
  icon: ReactNode;
};

const AVAILABLE_DESCRIPTION =
  "Special cakes released by Bakery for limited-time pickup.";

export function StorefrontFreshPicksCard({
  days,
  icon,
}: StorefrontFreshPicksCardProps) {
  const horizon = homepageFreshPicksHorizon(days);
  const count = days.length;
  const empty = count <= 0;
  const description = empty
    ? homepageFreshPicksDescription(horizon)
    : AVAILABLE_DESCRIPTION;
  const availabilityLines = empty
    ? []
    : homepageFreshPicksAvailabilityLines(days, toBusinessDateKey());

  return (
    <HomeDestinationCard
      actionLabel={empty ? "View Fresh Picks" : "See Fresh Picks"}
      ctaVariant="soft"
      dense
      tall
      description={description}
      extra={
        empty ? (
          <p className="text-skyline/80 mt-2 line-clamp-1 text-[11px] leading-tight md:mt-1">
            {homepageFreshPicksCountCopy(count, horizon)}
          </p>
        ) : (
          <ul className="text-ink mt-2 space-y-0.5 text-[11px] leading-tight md:mt-1">
            {availabilityLines.map((line) => (
              <li className="line-clamp-1" key={line}>
                {line}
              </li>
            ))}
          </ul>
        )
      }
      href="/extra"
      icon={icon}
      title="Fresh Picks"
      tone="linen"
      unavailable={empty}
    />
  );
}
