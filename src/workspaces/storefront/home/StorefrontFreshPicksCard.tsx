import Link from "next/link";
import {
  homepageFreshPicksCountCopy,
  homepageFreshPicksDescription,
  homepageFreshPicksHorizon,
  type FreshPickDay,
} from "@/engines/extra/customer-fresh-picks";

type StorefrontFreshPicksCardProps = {
  days: readonly FreshPickDay[];
};

export function StorefrontFreshPicksCard({
  days,
}: StorefrontFreshPicksCardProps) {
  const horizon = homepageFreshPicksHorizon(days);
  const count = days.length;
  const description = homepageFreshPicksDescription(horizon);
  const summary = homepageFreshPicksCountCopy(count, horizon);
  const empty = count <= 0;

  return (
    <article className="border-fog flex h-full flex-col border-t pt-6">
      <h3 className="font-display text-ink text-2xl tracking-tight">
        Fresh Picks
      </h3>
      <p className="text-skyline mt-3 flex-1 text-sm leading-relaxed">
        {description}
      </p>
      <p
        className={[
          "mt-4 text-sm",
          empty ? "text-skyline" : "text-ink",
        ].join(" ")}
      >
        {summary}
      </p>
      <Link
        className="text-ink hover:text-skyline mt-8 inline-flex min-h-11 items-center text-sm font-medium transition-colors duration-200"
        href="/extra"
      >
        View Fresh Picks →
      </Link>
    </article>
  );
}
