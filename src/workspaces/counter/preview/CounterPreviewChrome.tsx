import Link from "next/link";
import type { ReactNode } from "react";
import { PreviewJourneyNav } from "@/workspaces/preview-journey/PreviewJourneyNav";
import type { JourneyStep } from "@/workspaces/preview-journey/journey";
import {
  counterDashboardHref,
  type CounterHeroState,
} from "@/workspaces/counter/preview/counter-preview-demo";

type CounterPreviewChromeProps = {
  children: ReactNode;
  heroState: CounterHeroState;
  journeyStep?: JourneyStep | null;
};

export function CounterPreviewChrome({
  children,
  heroState,
  journeyStep = null,
}: CounterPreviewChromeProps) {
  const dashboardHref = counterDashboardHref(heroState, journeyStep);

  return (
    <div className="bg-mist min-h-dvh">
      <div className="sticky top-0 z-30">
        {journeyStep ? (
          <PreviewJourneyNav current="collection" step={journeyStep} />
        ) : null}
        <header className="bg-signal text-mist">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
            <Link className="min-w-0" href={dashboardHref}>
              <p className="text-[11px] font-medium tracking-[0.2em] text-white/60 uppercase">
                Whitebird · Collection
              </p>
              <p className="font-display truncate text-xl tracking-tight">
                At the Counter
              </p>
            </Link>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden rounded-full border border-white/25 px-3 py-1 text-xs text-white/80 sm:inline">
                Preview
              </span>
              <Link
                className="inline-flex min-h-11 items-center text-sm font-medium text-white/80 transition hover:text-white"
                href={dashboardHref}
              >
                Desk
              </Link>
            </div>
          </div>
        </header>
      </div>
      {children}
    </div>
  );
}
