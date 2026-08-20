import type { Metadata } from "next";
import { StorefrontCollectionCakesPage } from "@/workspaces/storefront/home/StorefrontCollectionCakesPage";

export const metadata: Metadata = {
  title: "Collection",
};

type CollectionOrderPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CollectionOrderPage({
  params,
}: CollectionOrderPageProps) {
  const { id } = await params;
  return <StorefrontCollectionCakesPage collectionId={id} />;
}
