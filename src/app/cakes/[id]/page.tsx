import type { Metadata } from "next";
import { StorefrontCakeDetail } from "@/workspaces/storefront/catalog/StorefrontCakeDetail";

export const metadata: Metadata = {
  title: "Cake",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pickup?: string; from?: string; to?: string }>;
};

export default async function CakePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <StorefrontCakeDetail
      cakeId={id}
      pickupScopeFrom={query.from ?? null}
      pickupScopePickup={query.pickup ?? null}
      pickupScopeTo={query.to ?? null}
    />
  );
}
