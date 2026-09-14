import type { Metadata } from "next";
import { StorefrontBrowsePage } from "@/workspaces/storefront/home/StorefrontBrowsePage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse Cakes",
  description: "Browse Whitebird cakes published for discovery.",
};

export default function BrowsePage() {
  return <StorefrontBrowsePage />;
}
