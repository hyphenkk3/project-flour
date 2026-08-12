import { notFound } from "next/navigation";
import { BakeryOrderDetail } from "@/workspaces/bakery/BakeryOrderDetail";
import { resolveBakeryBoardDate } from "@/workspaces/bakery/date";
import { getBakeryOrderDetail } from "@/workspaces/bakery/queries";

export const dynamic = "force-dynamic";

type BakeryOrderPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
};

export default async function BakeryOrderPage({
  params,
  searchParams,
}: BakeryOrderPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const boardDate = resolveBakeryBoardDate(query.date);
  const order = await getBakeryOrderDetail(id, boardDate);

  if (!order) {
    notFound();
  }

  return <BakeryOrderDetail boardDate={boardDate} order={order} />;
}
