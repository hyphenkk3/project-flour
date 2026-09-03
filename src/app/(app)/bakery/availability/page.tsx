import { redirect } from "next/navigation";
import { requireStaff } from "@/foundation/auth/session";
import { canAccessBakeryWorkspace } from "@/engines/bakery/capabilities";
import { parseOrderAvailabilityMonth } from "@/engines/business-calendar/order-availability";
import {
  canConfigureWaitingList,
  canManageWaitingList,
  canMutateOrderAvailability,
  canViewOrderAvailability,
  canViewWaitingList,
} from "@/foundation/navigation/access";
import { parseBusinessDate, toBusinessDateKey } from "@/lib/dates";
import { BakeryWorkspaceNav } from "@/workspaces/bakery/BakeryWorkspaceNav";
import { countExtraStockProposed } from "@/workspaces/extra/queries";
import { ProductionCapacitySection } from "@/workspaces/library/order-availability/capacity/ProductionCapacitySection";
import { AvailabilityOverviewSection } from "@/workspaces/library/order-availability/overview/AvailabilityOverviewSection";
import { OrderAvailabilityScreen } from "@/workspaces/library/order-availability/OrderAvailabilityScreen";
import { WaitingListSection } from "@/workspaces/waiting-list/WaitingListSection";

export const dynamic = "force-dynamic";

type BakeryAvailabilityPageProps = {
  searchParams: Promise<{
    month?: string;
    date?: string;
    overviewFrom?: string;
    wlCake?: string;
    wlStatus?: string;
    wlSize?: string;
  }>;
};

export default async function BakeryAvailabilityPage({
  searchParams,
}: BakeryAvailabilityPageProps) {
  const staff = await requireStaff();
  if (!canViewOrderAvailability(staff.role.code)) {
    redirect("/home");
  }

  const params = await searchParams;
  const today = toBusinessDateKey();
  const date = params.date?.trim().slice(0, 10) ?? "";
  const month = parseOrderAvailabilityMonth(
    parseBusinessDate(date) ? date.slice(0, 7) : params.month,
    today,
  );
  const canMutate = canMutateOrderAvailability(staff.role.code);
  const canViewQueue = canViewWaitingList(staff.role.code);
  const canManageQueue = canManageWaitingList(staff.role.code);
  const canConfigureQueue = canConfigureWaitingList(staff.role.code);
  const showWorkspaceLinks = canAccessBakeryWorkspace(staff.role.code);
  const proposedCount = showWorkspaceLinks
    ? await countExtraStockProposed()
    : 0;

  return (
    <div className="px-5 sm:px-8">
      <BakeryWorkspaceNav
        active="availability"
        proposedCount={proposedCount}
        showWorkspaceLinks={showWorkspaceLinks}
      />
      <div className="mt-6 space-y-10">
        <OrderAvailabilityScreen
          canMutate={canMutate}
          description="Close or reopen pickup dates for new customer preorders. Closing a date prevents new website preorders for that pickup date. Existing confirmed orders are unchanged."
          hrefBase="/bakery/availability"
          monthParam={month}
          title="Availability"
        />
        <ProductionCapacitySection
          canConfigureWaitingList={canConfigureQueue}
          canMutate={canMutate}
          dateParam={params.date}
          month={month}
        />
        {canViewQueue ? (
          <WaitingListSection
            cakeParam={params.wlCake}
            canConfigure={canConfigureQueue}
            canManage={canManageQueue}
            dateParam={params.date}
            month={month}
            sizeParam={params.wlSize}
            statusParam={params.wlStatus}
          />
        ) : null}
        <AvailabilityOverviewSection
          dateParam={params.date}
          fromParam={params.overviewFrom}
          month={month}
        />
      </div>
    </div>
  );
}
