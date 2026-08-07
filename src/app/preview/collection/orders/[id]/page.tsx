import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CounterOrderWorkspace } from "@/workspaces/counter/preview/CounterOrderWorkspace";
import {
  COUNTER_PREVIEW_ORDERS,
  getCounterOrder,
  parseCounterHeroState,
} from "@/workspaces/counter/preview/counter-preview-demo";
import { parseJourneyStep } from "@/workspaces/preview-journey/journey";

type CollectionOrderRouteProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    step?: string;
    arrived?: string;
    verified?: string;
    collected?: string;
  }>;
};

export function generateStaticParams() {
  return COUNTER_PREVIEW_ORDERS.map((order) => ({ id: order.id }));
}

export async function generateMetadata({
  params,
}: CollectionOrderRouteProps): Promise<Metadata> {
  const { id } = await params;
  const order = getCounterOrder(id, "none");
  return { title: order ? order.guestLabel : "Collection order" };
}

export default async function PreviewCollectionOrderRoute({
  params,
  searchParams,
}: CollectionOrderRouteProps) {
  const { id } = await params;
  const search = await searchParams;
  const heroState = parseCounterHeroState(search);
  const order = getCounterOrder(id, heroState);

  if (!order) {
    notFound();
  }

  return (
    <CounterOrderWorkspace
      heroState={heroState}
      journeyStep={parseJourneyStep(search.step)}
      order={order}
    />
  );
}
