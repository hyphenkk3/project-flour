import type { Metadata } from "next";
import { StorefrontSuccessPage } from "@/workspaces/storefront/checkout/StorefrontSuccessPage";

export const metadata: Metadata = {
  title: "Order Received · Whitebird",
};

export const dynamic = "force-dynamic";

type OrderSuccessPageProps = {
  searchParams: Promise<{ order?: string; flow?: string }>;
};

export default async function OrderSuccessPage({
  searchParams,
}: OrderSuccessPageProps) {
  const params = await searchParams;
  return (
    <StorefrontSuccessPage flow={params.flow} orderId={params.order} />
  );
}
