import type { Metadata } from "next";
import { StorefrontCheckoutPage } from "@/workspaces/storefront/checkout/StorefrontCheckoutPage";

export const metadata: Metadata = {
  title: "Your Preorder",
};

type CheckoutPageProps = {
  searchParams: Promise<{ pickup?: string; from?: string; to?: string }>;
};

export default async function OrderCheckoutPage({
  searchParams,
}: CheckoutPageProps) {
  const params = await searchParams;
  return (
    <StorefrontCheckoutPage
      fromQuery={params.from}
      pickupQuery={params.pickup}
      toQuery={params.to}
    />
  );
}
