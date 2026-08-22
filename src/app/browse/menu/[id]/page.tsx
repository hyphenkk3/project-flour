import type { Metadata } from "next";
import { StorefrontPastMenuPage } from "@/workspaces/storefront/home/StorefrontPastMenuPage";

export const metadata: Metadata = {
  title: "Past menu",
};

type BrowseMenuPageProps = {
  params: Promise<{ id: string }>;
};

export default async function BrowseMenuPage({ params }: BrowseMenuPageProps) {
  const { id } = await params;
  return <StorefrontPastMenuPage collectionId={id} />;
}
