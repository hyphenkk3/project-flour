import { BakeryExtraAwaitingReviewCallout } from "@/workspaces/bakery/BakeryExtraAwaitingReviewCallout";
import { BakeryLiveBoard } from "@/workspaces/bakery/BakeryLiveBoard";
import { BakeryWorkspaceNav } from "@/workspaces/bakery/BakeryWorkspaceNav";
import { resolveBakeryBoardDate } from "@/workspaces/bakery/date";
import { listBakeryBoardOrders } from "@/workspaces/bakery/queries";
import { countExtraStockProposed } from "@/workspaces/extra/queries";

export const dynamic = "force-dynamic";

type BakeryPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function BakeryPage({ searchParams }: BakeryPageProps) {
  const params = await searchParams;
  const boardDate = resolveBakeryBoardDate(params.date);
  const [orders, proposedCount] = await Promise.all([
    listBakeryBoardOrders(boardDate),
    countExtraStockProposed(),
  ]);

  return (
    <>
      <div className="px-5 sm:px-8">
        <BakeryWorkspaceNav
          active="production"
          proposedCount={proposedCount}
        />
        <BakeryExtraAwaitingReviewCallout count={proposedCount} />
      </div>
      <BakeryLiveBoard boardDate={boardDate} initialOrders={orders} />
    </>
  );
}
