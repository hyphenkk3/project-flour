import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CounterVerifyPage } from "@/workspaces/counter/preview/CounterVerifyPage";
import {
  COUNTER_PREVIEW_ORDERS,
  getCounterOrder,
} from "@/workspaces/counter/preview/counter-preview-demo";
import { parseJourneyStep } from "@/workspaces/preview-journey/journey";

type CollectionVerifyRouteProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
};

export function generateStaticParams() {
  return COUNTER_PREVIEW_ORDERS.map((order) => ({ id: order.id }));
}

export async function generateMetadata({
  params,
}: CollectionVerifyRouteProps): Promise<Metadata> {
  const { id } = await params;
  const order = getCounterOrder(id, "arrived");
  return {
    title: order ? `Verify · ${order.guestLabel}` : "Verify order",
  };
}

export default async function PreviewCollectionVerifyRoute({
  params,
  searchParams,
}: CollectionVerifyRouteProps) {
  const { id } = await params;
  const order = getCounterOrder(id, "arrived");

  if (!order) {
    notFound();
  }

  return (
    <CounterVerifyPage
      journeyStep={parseJourneyStep((await searchParams).step)}
      order={order}
    />
  );
}
