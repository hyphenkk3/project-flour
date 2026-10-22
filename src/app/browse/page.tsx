import type { Metadata } from "next";
import { StorefrontBrowsePage } from "@/workspaces/storefront/home/StorefrontBrowsePage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse Cakes",
  description: "Browse Whitebird cakes published for discovery.",
};

type BrowsePageProps = {
  searchParams: Promise<{ __catalogue_failure?: string | string[] }>;
};

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const failure = (await searchParams).__catalogue_failure;
  return <StorefrontBrowsePage injectCatalogueFailure={failure === "browse"} />;
}
