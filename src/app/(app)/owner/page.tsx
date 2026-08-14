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
    sort?: string;
  }>;
};

/** Operations Live Board — Owner + Customer Operations preorder operators. */
export default async function OwnerPage({ searchParams }: PageProps) {
  const staff = await requireStaff();
  if (!canAccessOperationsBoard(staff.role.code)) {
    redirect(
      staff.role.code === "manager" ? "/owner/approvals" : "/home",
    );
  }
  const params = await searchParams;
  const initialQuery = parseOperationsBoardSearchParams(params);
  return <OwnerDashboard initialQuery={initialQuery} />;
}
