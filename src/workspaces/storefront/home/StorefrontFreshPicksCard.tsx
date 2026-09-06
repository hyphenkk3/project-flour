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
  imageUrl?: string | null;
  imageAlt?: string | null;
};

export function StorefrontFreshPicksCard({
  days,
  icon,
  imageUrl = null,
  imageAlt = null,
}: StorefrontFreshPicksCardProps) {
  const horizon = homepageFreshPicksHorizon(days);
  const count = days.length;
  const description = homepageFreshPicksDescription(horizon);
  const summary = homepageFreshPicksCountCopy(count, horizon);
  const empty = count <= 0;

  return (
    <HomeDestinationCard
      actionLabel="View Fresh Picks"
      description={description}
      extra={
        <p
          className={[
            "mt-1 line-clamp-1 text-xs",
            empty ? "text-skyline" : "text-ink",
          ].join(" ")}
        >
          {summary}
        </p>
      }
      href="/extra"
      icon={icon}
      imageAlt={imageAlt}
      imageUrl={imageUrl}
      title="Fresh Picks"
      tone="linen"
    />
  );
}
