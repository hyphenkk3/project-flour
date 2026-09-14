import type { Metadata } from "next";
import { StorefrontCakeDetail } from "@/workspaces/storefront/catalog/StorefrontCakeDetail";

export const metadata: Metadata = {
  title: "Cake",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CakePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  return <StorefrontCakeDetail cakeId={id} searchParams={searchParams} />;
}
