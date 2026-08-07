import type { Metadata } from "next";
import { StorefrontCheckoutPage } from "@/workspaces/storefront/checkout/StorefrontCheckoutPage";

export const metadata: Metadata = {
  title: "Your Preorder · Whitebird",
};

export default async function OrderPage() {
  return <StorefrontCheckoutPage />;
}
