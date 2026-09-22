import type { Metadata } from "next";
import { StorefrontCheckoutPage } from "@/workspaces/storefront/checkout/StorefrontCheckoutPage";

export const metadata: Metadata = {
  title: "Your Preorder",
};

export const dynamic = "force-dynamic";

export default function OrderCheckoutPage() {
  return <StorefrontCheckoutPage />;
}
