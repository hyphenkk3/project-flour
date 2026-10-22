import type { Metadata } from "next";
import { StorefrontHomePage } from "@/workspaces/storefront/home/StorefrontHomePage";
import { StorefrontShell } from "@/workspaces/storefront/StorefrontShell";
import { storefrontViewport } from "@/workspaces/storefront/storefront-viewport";

export const metadata: Metadata = {
  title: "Whitebird",
  description: "Preorder a cake for pickup.",
};

export const viewport = storefrontViewport;

type HomePageProps = {
  searchParams: Promise<{ __catalogue_failure?: string | string[] }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const failure = (await searchParams).__catalogue_failure;
  return (
    <StorefrontShell>
      <StorefrontHomePage injectCatalogueFailure={failure === "home"} />
    </StorefrontShell>
  );
}
