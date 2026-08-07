import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewOrderWorkspace } from "@/workspaces/customer-operations/preview/PreviewOrderWorkspace";
import {
  getPreviewOrder,
  parsePreviewHeroState,
  PREVIEW_ORDERS,
} from "@/workspaces/customer-operations/preview/preview-demo";
import { parseJourneyStep } from "@/workspaces/preview-journey/journey";

type PreviewOrderRouteProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    step?: string;
    sent?: string;
    confirmed?: string;
    payment?: string;
    receipt?: string;
    verified?: string;
  }>;
};

export function generateStaticParams() {
  return PREVIEW_ORDERS.map((order) => ({ id: order.id }));
}

export async function generateMetadata({
  params,
}: PreviewOrderRouteProps): Promise<Metadata> {
  const { id } = await params;
  const order = getPreviewOrder(id, "none");
  return { title: order ? order.customerName : "Order" };
}

export default async function PreviewOrderRoute({
  params,
  searchParams,
}: PreviewOrderRouteProps) {
  const { id } = await params;
  const search = await searchParams;
  const heroState = parsePreviewHeroState(search);
  const order = getPreviewOrder(id, heroState);

  if (!order) {
    notFound();
  }

  return (
    <PreviewOrderWorkspace
      heroState={heroState}
      journeyStep={parseJourneyStep(search.step)}
      order={order}
    />
  );
}
