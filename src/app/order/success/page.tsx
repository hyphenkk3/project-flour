import type { Metadata } from "next";
import { StorefrontSuccessPage } from "@/workspaces/storefront/checkout/StorefrontSuccessPage";

export const metadata: Metadata = {
  title: "Thank you · Whitebird",
};

export const dynamic = "force-dynamic";

type OrderSuccessPageProps = {
  searchParams: Promise<{ order?: string }>;
};

export default async function OrderSuccessPage({
  searchParams,
}: OrderSuccessPageProps) {
  const params = await searchParams;
  return <StorefrontSuccessPage orderId={params.order} />;
}
