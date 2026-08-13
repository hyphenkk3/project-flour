import { BakeryLiveBoard } from "@/workspaces/bakery/BakeryLiveBoard";
import { BakeryWorkspaceNav } from "@/workspaces/bakery/BakeryWorkspaceNav";
import { resolveBakeryBoardDate } from "@/workspaces/bakery/date";
import { listBakeryBoardOrders } from "@/workspaces/bakery/queries";

export const dynamic = "force-dynamic";

type BakeryPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function BakeryPage({ searchParams }: BakeryPageProps) {
  const params = await searchParams;
  const boardDate = resolveBakeryBoardDate(params.date);
  const orders = await listBakeryBoardOrders(boardDate);

  return (
    <>
      <div className="px-5 sm:px-8">
        <BakeryWorkspaceNav active="production" />
      </div>
      <BakeryLiveBoard boardDate={boardDate} initialOrders={orders} />
    </>
  );
}
