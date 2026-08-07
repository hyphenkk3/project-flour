import type { Metadata } from "next";
import { CounterCollectionBoard } from "@/workspaces/counter/preview/CounterCollectionBoard";
import { parseCounterHeroState } from "@/workspaces/counter/preview/counter-preview-demo";
import { parseJourneyStep } from "@/workspaces/preview-journey/journey";

export const metadata: Metadata = {
  title: "Collection Preview",
  description: "At the counter — arrive, verify, and collect.",
};

type CollectionPreviewRouteProps = {
  searchParams: Promise<{
    step?: string;
    arrived?: string;
    verified?: string;
    collected?: string;
  }>;
};

export default async function PreviewCollectionPage({
  searchParams,
}: CollectionPreviewRouteProps) {
  const search = await searchParams;
  return (
    <CounterCollectionBoard
      heroState={parseCounterHeroState(search)}
      journeyStep={parseJourneyStep(search.step)}
    />
  );
}
