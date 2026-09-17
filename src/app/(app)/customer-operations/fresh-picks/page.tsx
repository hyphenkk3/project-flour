import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { buildExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";
import { toBusinessDateKey } from "@/lib/dates";
import { ExtraBoard } from "@/workspaces/extra/ExtraBoard";
import { listExtraStockUnits } from "@/workspaces/extra/queries";

export const dynamic = "force-dynamic";

export default async function CustomerOperationsFreshPicksPage() {
  const staff = await requireStaff();
  const capabilities = buildExtraWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  if (!capabilities.canViewWalkInHold) {
    redirect("/customer-operations/orders");
  }

  const units = await listExtraStockUnits();

  return (
    <ExtraBoard
      cakes={[]}
      capabilities={capabilities}
      surface="walk-in-hold"
      todayYmd={toBusinessDateKey()}
      units={units}
    />
  );
}
