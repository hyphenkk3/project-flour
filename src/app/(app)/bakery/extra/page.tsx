import { requireStaff } from "@/foundation/auth/session";
import { buildExtraWorkspaceCapabilities } from "@/engines/extra/capabilities";
import { toBusinessDateKey } from "@/lib/dates";
import { BakeryWorkspaceNav } from "@/workspaces/bakery/BakeryWorkspaceNav";
import { ExtraBoard } from "@/workspaces/extra/ExtraBoard";
import {
  countExtraStockProposed,
  listExtraCakeOptions,
  listExtraStockUnits,
} from "@/workspaces/extra/queries";

export const dynamic = "force-dynamic";

type BakeryExtraPageProps = {
  searchParams: Promise<{ mode?: string }>;
};

export default async function BakeryExtraPage({
  searchParams,
}: BakeryExtraPageProps) {
  const staff = await requireStaff();
  const params = await searchParams;
  const initialMode = params.mode === "propose" ? "propose" : "create";
  const capabilities = buildExtraWorkspaceCapabilities({
    role: staff.role.code,
    staffId: staff.id,
  });
  const [units, cakes, proposedCount] = await Promise.all([
    listExtraStockUnits(),
    listExtraCakeOptions(),
    countExtraStockProposed(),
  ]);

  return (
    <>
      <div className="px-5 sm:px-8">
        <BakeryWorkspaceNav active="extra" proposedCount={proposedCount} />
      </div>
      <ExtraBoard
        cakes={cakes}
        capabilities={capabilities}
        initialMode={initialMode}
        todayYmd={toBusinessDateKey()}
        units={units}
      />
    </>
  );
}
