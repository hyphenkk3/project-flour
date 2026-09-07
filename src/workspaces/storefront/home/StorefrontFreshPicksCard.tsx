import type { ReactNode } from "react";
import {
  homepageFreshPicksCountCopy,
  homepageFreshPicksDescription,
  homepageFreshPicksHorizon,
  type FreshPickDay,
} from "@/engines/extra/customer-fresh-picks";
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

  return (
    <HomeDestinationCard
      actionLabel={empty ? "View Fresh Picks" : "See Fresh Picks"}
      ctaVariant="soft"
      description={description}
      extra={
        empty ? (
          <p className="text-skyline/80 mt-1 line-clamp-1 text-xs">
            {homepageFreshPicksCountCopy(count, horizon)}
          </p>
        ) : undefined
      }
      href="/extra"
      icon={icon}
      title="Fresh Picks"
      tone="linen"
      unavailable={empty}
    />
  );
}
