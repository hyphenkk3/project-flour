import { parseCollectionDineInVenueFilter } from "@/workspaces/collection/board-tab";
import { CollectionLiveBoard } from "@/workspaces/collection/CollectionLiveBoard";
import { resolveCollectionBoardDate } from "@/workspaces/collection/date";
import { parseCollectionBoardTab } from "@/workspaces/collection/eligibility";
import { listCollectionOrdersForTab } from "@/workspaces/collection/queries";

export const dynamic = "force-dynamic";

type CollectionPageProps = {
  searchParams: Promise<{ date?: string; tab?: string; venue?: string }>;
};

export default async function CollectionPage({
  searchParams,
}: CollectionPageProps) {
  const params = await searchParams;
  const boardDate = resolveCollectionBoardDate(params.date);
  const tab = parseCollectionBoardTab(params.tab);
  const venueFilter = parseCollectionDineInVenueFilter(params.venue);
  const orders = await listCollectionOrdersForTab(tab, boardDate);

  return (
    <CollectionLiveBoard
      boardDate={boardDate}
      initialOrders={orders}
      tab={tab}
      venueFilter={venueFilter}
    />
  );
}
