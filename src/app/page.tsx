import type { Metadata } from "next";
import { StorefrontHomePage } from "@/workspaces/storefront/home/StorefrontHomePage";

export const metadata: Metadata = {
  title: "Whitebird",
  description: "Choose a cake for your celebration.",
};

export default function HomePage() {
  return <StorefrontHomePage />;
}
