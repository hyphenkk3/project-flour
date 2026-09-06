import type { Metadata } from "next";
import { StorefrontFaqPage } from "@/workspaces/storefront/home/StorefrontFaqPage";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Ordering with Whitebird — preorder, collection, payment, and Fresh Picks.",
};

export default function FaqPage() {
  return <StorefrontFaqPage />;
}
