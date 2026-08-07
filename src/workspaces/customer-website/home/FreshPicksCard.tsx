import {
  FRESH_PICKS_DEMO,
  freshPicksCopy,
  type FreshPicksDemo,
} from "@/workspaces/customer-website/home/fresh-picks-demo";

type FreshPicksCardProps = {
  demo?: FreshPicksDemo;
};

export function FreshPicksCard({
  demo = FRESH_PICKS_DEMO,
}: FreshPicksCardProps) {
  const copy = freshPicksCopy(demo);
  const isMuted = demo.status === "updating" || demo.status === "unavailable";
  const isLimited = demo.status === "limited";

  return (
    <article
      className={[
        "flex h-full flex-col rounded-3xl border p-6 transition duration-200 sm:p-7",
        isMuted
          ? "border-fog/80 bg-white/70"
          : isLimited
            ? "border-status-warning/30 hover:border-status-warning/50 bg-white"
            : "border-fog hover:border-signal/50 bg-white hover:-translate-y-0.5",
      ].join(" ")}
    >
      <p className="text-3xl" aria-hidden>
        ⚡
      </p>
      <h3 className="text-ink mt-4 text-xl font-semibold tracking-tight">
        Today&apos;s Fresh Picks
      </h3>
      <p
        className={[
          "mt-2 text-xs font-medium tracking-[0.14em] uppercase",
          isLimited
            ? "text-status-warning"
            : isMuted
              ? "text-skyline/60"
              : "text-signal",
        ].join(" ")}
      >
        {copy.eyebrow}
      </p>
      <p
        className={[
          "mt-3 flex-1 text-sm leading-relaxed sm:text-base",
          isMuted ? "text-skyline/70" : "text-skyline",
        ].join(" ")}
      >
        {copy.body}
      </p>
      <button
        className={[
          "mt-8 inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-medium transition",
          copy.enabled
            ? "bg-ink text-mist hover:bg-skyline"
            : "bg-fog text-skyline/50 cursor-not-allowed",
        ].join(" ")}
        disabled={!copy.enabled}
        type="button"
      >
        {copy.buttonLabel}
      </button>
    </article>
  );
}
