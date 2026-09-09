import type { Metadata } from "next";
import { StorefrontExtraCheckoutPage } from "@/workspaces/storefront/extra/StorefrontExtraCheckoutPage";

export const metadata: Metadata = {
  title: "Your Fresh Pick Order",
};

export default function ExtraCheckoutRoute() {
  return <StorefrontExtraCheckoutPage />;
}
