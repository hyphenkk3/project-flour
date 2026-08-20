import type { Metadata } from "next";
import { StorefrontOrderCollectionsPage } from "@/workspaces/storefront/home/StorefrontOrderCollectionsPage";

export const metadata: Metadata = {
  title: "Order",
  description: "Choose a Whitebird collection to preorder for pickup.",
};

export default function OrderPage() {
  return <StorefrontOrderCollectionsPage />;
}
