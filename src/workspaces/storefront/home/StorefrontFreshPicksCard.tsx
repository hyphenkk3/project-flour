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
    <article
      className={[
        "flex h-full flex-col rounded-3xl border p-7 transition duration-200",
        empty
          ? "border-fog/80 bg-white/80"
          : "border-fog hover:border-signal/40 bg-white",
      ].join(" ")}
    >
      <h3 className="text-ink text-xl font-medium tracking-tight">
        Fresh Picks
      </h3>
      <p className="text-skyline mt-3 flex-1 text-sm leading-relaxed">
        {description}
      </p>
      <p
        className={[
          "mt-4 text-sm",
          empty ? "text-skyline" : "text-ink font-medium",
        ].join(" ")}
      >
        {summary}
      </p>
      <Link
        className="border-ink/15 text-ink hover:border-ink/40 mt-8 inline-flex min-h-11 items-center justify-center rounded-full border bg-white px-5 text-sm font-medium transition"
        href="/extra"
      >
        View Fresh Picks
      </Link>
    </article>
  );
}
