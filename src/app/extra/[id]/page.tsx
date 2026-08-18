import type { Metadata } from "next";
import { StorefrontExtraOrderPage } from "@/workspaces/storefront/extra/StorefrontExtraOrderPage";

export const metadata: Metadata = {
  title: "Order Fresh Pick",
  description: "Order a Bakery Fresh Pick extra cake for pickup.",
};

type ExtraOrderRouteProps = {
  params: Promise<{ id: string }>;
};

export default async function ExtraOrderRoute({
  params,
}: ExtraOrderRouteProps) {
  const { id } = await params;
  return <StorefrontExtraOrderPage extraId={id} />;
}
