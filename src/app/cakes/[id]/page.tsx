import type { Metadata } from "next";
import { StorefrontCakeDetail } from "@/workspaces/storefront/catalog/StorefrontCakeDetail";

export const metadata: Metadata = {
  title: "Cake · Whitebird",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CakePage({ params }: PageProps) {
  const { id } = await params;
  return <StorefrontCakeDetail cakeId={id} />;
}
