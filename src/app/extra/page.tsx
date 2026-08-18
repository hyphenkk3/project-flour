import type { Metadata } from "next";
import { StorefrontExtraPage } from "@/workspaces/storefront/home/StorefrontExtraPage";

export const metadata: Metadata = {
  title: "Fresh Picks",
  description:
    "Extra cakes available today or tomorrow. Limited quantities, available for pickup during the stated window.",
};

export default function ExtraPage() {
  return <StorefrontExtraPage />;
}
