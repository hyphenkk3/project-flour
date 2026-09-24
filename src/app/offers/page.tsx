import type { Metadata } from "next";
import { StorefrontOffersPage } from "@/workspaces/storefront/offers/StorefrontOffersPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Current Offers · Whitebird",
  description: "Browse current Whitebird cake promotions.",
};

export default function OffersPage() {
  return <StorefrontOffersPage />;
}
