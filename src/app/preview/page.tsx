import type { Metadata } from "next";
import { JourneyHubPage } from "@/workspaces/preview-journey/JourneyHubPage";

export const metadata: Metadata = {
  title: "Connected Order Journey",
  description: "Walk one Whitebird preorder from website to collection.",
};

export default function PreviewJourneyRoute() {
  return <JourneyHubPage />;
}
