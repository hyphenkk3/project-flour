import { OwnerOrderDetail } from "@/workspaces/owner/OwnerOrderDetail";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function OwnerOrderPage({ params }: PageProps) {
  const { id } = await params;
  return <OwnerOrderDetail orderId={id} />;
}
