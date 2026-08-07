import type { Metadata } from "next";
import { BakeryProductionBoard } from "@/workspaces/bakery/preview/BakeryProductionBoard";
import { parseBakeryHeroState } from "@/workspaces/bakery/preview/bakery-preview-demo";
import { parseJourneyStep } from "@/workspaces/preview-journey/journey";

export const metadata: Metadata = {
  title: "Bakery Preview",
  description: "Today’s production — start, make, and mark cakes ready.",
};

type BakeryPreviewRouteProps = {
  searchParams: Promise<{
    step?: string;
    started?: string;
    ready?: string;
    accepted?: string;
  }>;
};

export default async function PreviewBakeryPage({
  searchParams,
}: BakeryPreviewRouteProps) {
  const search = await searchParams;
  return (
    <BakeryProductionBoard
      heroState={parseBakeryHeroState(search)}
      journeyStep={parseJourneyStep(search.step)}
    />
  );
}
