import { CollectionLiveBoard } from "@/workspaces/collection/CollectionLiveBoard";
import { resolveCollectionBoardDate } from "@/workspaces/collection/date";
import { listCollectionBoardOrders } from "@/workspaces/collection/queries";

export const dynamic = "force-dynamic";

type CollectionPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function CollectionPage({
  searchParams,
}: CollectionPageProps) {
  const params = await searchParams;
  const boardDate = resolveCollectionBoardDate(params.date);
  const orders = await listCollectionBoardOrders(boardDate);

  return (
    <CollectionLiveBoard boardDate={boardDate} initialOrders={orders} />
  );
}
