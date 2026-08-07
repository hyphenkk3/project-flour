import type { Metadata } from "next";
import { PreviewDashboard } from "@/workspaces/customer-operations/preview/PreviewDashboard";
import { parsePreviewHeroState } from "@/workspaces/customer-operations/preview/preview-demo";
import { parseJourneyStep } from "@/workspaces/preview-journey/journey";

export const metadata: Metadata = {
  title: "Customer Operations Preview",
  description:
    "Vivian’s morning dashboard — review, confirmation, payment, and verification.",
};

type PreviewDashboardRouteProps = {
  searchParams: Promise<{
    step?: string;
    sent?: string;
    confirmed?: string;
    payment?: string;
    receipt?: string;
    verified?: string;
  }>;
};

export default async function PreviewCustomerOperationsPage({
  searchParams,
}: PreviewDashboardRouteProps) {
  const search = await searchParams;
  return (
    <PreviewDashboard
      heroState={parsePreviewHeroState(search)}
      journeyStep={parseJourneyStep(search.step)}
    />
  );
}
