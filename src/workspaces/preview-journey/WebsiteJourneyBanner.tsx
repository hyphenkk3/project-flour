import { PreviewJourneyNav } from "@/workspaces/preview-journey/PreviewJourneyNav";
import type { JourneyStep } from "@/workspaces/preview-journey/journey";

type WebsiteJourneyBannerProps = {
  step: JourneyStep;
};

export function WebsiteJourneyBanner({ step }: WebsiteJourneyBannerProps) {
  return (
    <div className="sticky top-0 z-30">
      <PreviewJourneyNav current="website" step={step} />
    </div>
  );
}
