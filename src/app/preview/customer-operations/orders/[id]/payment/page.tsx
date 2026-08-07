import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewPaymentPage } from "@/workspaces/customer-operations/preview/PreviewPaymentPage";
import {
  getPreviewOrder,
  PREVIEW_ORDERS,
} from "@/workspaces/customer-operations/preview/preview-demo";
import { parseJourneyStep } from "@/workspaces/preview-journey/journey";

type PreviewPaymentRouteProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
};

export function generateStaticParams() {
  return PREVIEW_ORDERS.filter((order) => order.paymentMessage).map(
    (order) => ({ id: order.id }),
  );
}

export async function generateMetadata({
  params,
}: PreviewPaymentRouteProps): Promise<Metadata> {
  const { id } = await params;
  const order = getPreviewOrder(id, "confirmed");
  return {
    title: order ? `Payment · ${order.customerName}` : "Payment request",
  };
}

export default async function PreviewPaymentRoute({
  params,
  searchParams,
}: PreviewPaymentRouteProps) {
  const { id } = await params;
  const order = getPreviewOrder(id, "confirmed");

  if (!order?.paymentMessage) {
    notFound();
  }

  return (
    <PreviewPaymentPage
      journeyStep={parseJourneyStep((await searchParams).step)}
      order={order}
    />
  );
}
