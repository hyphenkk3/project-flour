import { OwnerOrderDetail } from "@/workspaces/owner/OwnerOrderDetail";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function OwnerOrderPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  return <OwnerOrderDetail orderId={id} returnTo={query.returnTo} />;
}
