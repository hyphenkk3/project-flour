import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewConfirmationPage } from "@/workspaces/customer-operations/preview/PreviewConfirmationPage";
import {
  getPreviewOrder,
  PREVIEW_ORDERS,
} from "@/workspaces/customer-operations/preview/preview-demo";
import { parseJourneyStep } from "@/workspaces/preview-journey/journey";

type PreviewConfirmRouteProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
};

export function generateStaticParams() {
  return PREVIEW_ORDERS.filter((order) => order.confirmationMessage).map(
    (order) => ({ id: order.id }),
  );
}

export async function generateMetadata({
  params,
}: PreviewConfirmRouteProps): Promise<Metadata> {
  const { id } = await params;
  const order = getPreviewOrder(id, "none");
  return {
    title: order ? `Confirm · ${order.customerName}` : "Confirmation",
  };
}

export default async function PreviewConfirmRoute({
  params,
  searchParams,
}: PreviewConfirmRouteProps) {
  const { id } = await params;
  const order = getPreviewOrder(id, "none");

  if (!order?.confirmationMessage) {
    notFound();
  }

  return (
    <PreviewConfirmationPage
      journeyStep={parseJourneyStep((await searchParams).step)}
      order={order}
    />
  );
}
