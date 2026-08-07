import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BakeryOrderWorkspace } from "@/workspaces/bakery/preview/BakeryOrderWorkspace";
import {
  BAKERY_PREVIEW_ORDERS,
  getBakeryOrder,
  parseBakeryHeroState,
} from "@/workspaces/bakery/preview/bakery-preview-demo";
import { parseJourneyStep } from "@/workspaces/preview-journey/journey";

type BakeryOrderRouteProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    step?: string;
    started?: string;
    ready?: string;
    accepted?: string;
  }>;
};

export function generateStaticParams() {
  return BAKERY_PREVIEW_ORDERS.map((order) => ({ id: order.id }));
}

export async function generateMetadata({
  params,
}: BakeryOrderRouteProps): Promise<Metadata> {
  const { id } = await params;
  const order = getBakeryOrder(id, "none");
  return { title: order ? order.cakeName : "Bakery order" };
}

export default async function PreviewBakeryOrderRoute({
  params,
  searchParams,
}: BakeryOrderRouteProps) {
  const { id } = await params;
  const search = await searchParams;
  const heroState = parseBakeryHeroState(search);
  const order = getBakeryOrder(id, heroState);

  if (!order) {
    notFound();
  }

  return (
    <BakeryOrderWorkspace
      heroState={heroState}
      journeyStep={parseJourneyStep(search.step)}
      order={order}
    />
  );
}
