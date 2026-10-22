import type { Metadata } from "next";
import { StorefrontCollectionCakesPage } from "@/workspaces/storefront/home/StorefrontCollectionCakesPage";

export const metadata: Metadata = {
  title: "Collection",
};

type CollectionOrderPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ __catalogue_failure?: string | string[] }>;
};

export default async function CollectionOrderPage({
  params,
  searchParams,
}: CollectionOrderPageProps) {
  const failure = (await searchParams).__catalogue_failure;
  return (
    <StorefrontCollectionCakesPage
      params={params}
      injectCatalogueFailure={failure === "monthly"}
    />
  );
}
