import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { parseOperationsBoardSearchParams } from "@/engines/operations/order-board";
import { canAccessOperationsBoard } from "@/engines/orders/delivery-finance-capabilities";
import { OwnerDashboard } from "@/workspaces/owner/OwnerDashboard";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    pickup?: string;
    date?: string;
    status?: string;
    lifecycle?: string;
    sort?: string;
    search?: string;
  }>;
};

/** Operations Live Board — Owner + Manager + Customer Operations (view). */
export default async function OwnerPage({ searchParams }: PageProps) {
  const staff = await requireStaff();
  if (!canAccessOperationsBoard(staff.role.code)) {
    redirect("/home");
  }
  const params = await searchParams;
  const initialQuery = parseOperationsBoardSearchParams(params);
  return <OwnerDashboard initialQuery={initialQuery} />;
}
