import type { Metadata } from "next";
import { StorefrontCakeDetail } from "@/workspaces/storefront/catalog/StorefrontCakeDetail";

export const metadata: Metadata = {
  title: "Cake",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function CakePage({ params, searchParams }: PageProps) {
  return <StorefrontCakeDetail params={params} searchParams={searchParams} />;
}
