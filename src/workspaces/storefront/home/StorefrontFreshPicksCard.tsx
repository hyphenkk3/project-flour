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

export function StorefrontFreshPicksCard({
  days,
  icon,
}: StorefrontFreshPicksCardProps) {
  const horizon = homepageFreshPicksHorizon(days);
  const count = days.length;
  const description = homepageFreshPicksDescription(horizon);
  const summary = homepageFreshPicksCountCopy(count, horizon);
  const empty = count <= 0;

  return (
    <HomeDestinationCard
      actionLabel="View Fresh Picks"
      ctaVariant="soft"
      description={description}
      extra={
        <p
          className={[
            "mt-1 line-clamp-1 text-xs",
            empty ? "text-skyline/80" : "text-ink",
          ].join(" ")}
        >
          {summary}
        </p>
      }
      href="/extra"
      icon={icon}
      title="Fresh Picks"
      tone="linen"
      unavailable={empty}
    />
  );
}
