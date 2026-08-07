import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewReceiptPage } from "@/workspaces/customer-operations/preview/PreviewReceiptPage";
import {
  getPreviewOrder,
  PREVIEW_ORDERS,
} from "@/workspaces/customer-operations/preview/preview-demo";
import { parseJourneyStep } from "@/workspaces/preview-journey/journey";

type PreviewReceiptRouteProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
};

export function generateStaticParams() {
  return PREVIEW_ORDERS.filter((order) => order.payment).map((order) => ({
    id: order.id,
  }));
}

export async function generateMetadata({
  params,
}: PreviewReceiptRouteProps): Promise<Metadata> {
  const { id } = await params;
  const order = getPreviewOrder(id, "receipt_submitted");
  return {
    title: order ? `Receipt · ${order.customerName}` : "Review receipt",
  };
}

export default async function PreviewReceiptRoute({
  params,
  searchParams,
}: PreviewReceiptRouteProps) {
  const { id } = await params;
  const order = getPreviewOrder(id, "receipt_submitted");

  if (!order?.payment) {
    notFound();
  }

  return (
    <PreviewReceiptPage
      journeyStep={parseJourneyStep((await searchParams).step)}
      order={order}
    />
  );
}
