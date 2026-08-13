import { notFound } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { buildCollectionWorkspaceCapabilities } from "@/engines/collection/capabilities";
import { CollectionOrderDetail } from "@/workspaces/collection/CollectionOrderDetail";
import { resolveCollectionBoardDate } from "@/workspaces/collection/date";
import { getCollectionOrderDetail } from "@/workspaces/collection/queries";

export const dynamic = "force-dynamic";

type CollectionOrderPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
};

export default async function CollectionOrderPage({
  params,
  searchParams,
}: CollectionOrderPageProps) {
  const staff = await requireStaff();
  const capabilities = buildCollectionWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  const { id } = await params;
  const query = await searchParams;
  const boardDate = resolveCollectionBoardDate(query.date);
  const order = await getCollectionOrderDetail(id, boardDate);

  if (!order) {
    notFound();
  }

  return (
    <CollectionOrderDetail
      boardDate={boardDate}
      capabilities={capabilities}
      order={order}
    />
  );
}
