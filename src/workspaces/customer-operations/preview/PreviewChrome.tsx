import Link from "next/link";
import type { ReactNode } from "react";
import { PreviewJourneyNav } from "@/workspaces/preview-journey/PreviewJourneyNav";
import type { JourneyStep } from "@/workspaces/preview-journey/journey";
import {
  previewDashboardHref,
  type PreviewHeroState,
} from "@/workspaces/customer-operations/preview/preview-demo";

type PreviewChromeProps = {
  children: ReactNode;
  heroState: PreviewHeroState;
  journeyStep?: JourneyStep | null;
};

export function PreviewChrome({
  children,
  heroState,
  journeyStep = null,
}: PreviewChromeProps) {
  const dashboardHref = previewDashboardHref(heroState, journeyStep);

  return (
    <div className="bg-mist min-h-dvh">
      <div className="sticky top-0 z-30">
        {journeyStep ? (
          <PreviewJourneyNav current="customer_operations" step={journeyStep} />
        ) : null}
        <header className="border-fog/70 border-b bg-white/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <Link className="min-w-0" href={dashboardHref}>
              <p className="text-signal text-[11px] font-medium tracking-[0.2em] uppercase">
                Whitebird · Customer Operations
              </p>
              <p className="font-display text-ink truncate text-xl tracking-tight">
                Good morning, Vivian
              </p>
            </Link>
            <div className="flex shrink-0 items-center gap-3">
              <span className="border-fog text-skyline hidden rounded-full border px-3 py-1 text-xs sm:inline">
                Preview
              </span>
              <Link
                className="text-skyline hover:text-ink inline-flex min-h-11 items-center text-sm font-medium transition"
                href={dashboardHref}
              >
                This morning
              </Link>
            </div>
          </div>
        </header>
      </div>
      {children}
    </div>
  );
}
