import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StorefrontCheckoutPage } from "@/workspaces/storefront/checkout/StorefrontCheckoutPage";

export const metadata: Metadata = {
  title: "Checkout · Whitebird",
};

type PageProps = {
  searchParams: Promise<{ cake?: string; size?: string }>;
};

export default async function OrderPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const cakeId = params.cake?.trim();
  if (!cakeId) {
    redirect("/");
  }

  return (
    <StorefrontCheckoutPage cakeId={cakeId} sizeId={params.size?.trim()} />
  );
}
