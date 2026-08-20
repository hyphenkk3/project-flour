import type { Metadata } from "next";
import { StorefrontHomePage } from "@/workspaces/storefront/home/StorefrontHomePage";

export const metadata: Metadata = {
  title: "Whitebird",
  description: "Preorder a cake for pickup.",
};

export default function HomePage() {
  return <StorefrontHomePage />;
}
