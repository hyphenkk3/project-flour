import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { PagePanel } from "@/components/ui";
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
import { firstQueryDateParam, firstQueryParam } from "@/lib/query-params";
import { BakeryWorkspaceNav } from "@/workspaces/bakery/BakeryWorkspaceNav";
import { countExtraStockProposed } from "@/workspaces/extra/queries";
import { AvailabilityDateBar } from "@/workspaces/library/order-availability/AvailabilityDateBar";
import { AvailabilitySectionNav } from "@/workspaces/library/order-availability/AvailabilitySectionNav";
import { PickupDateClosureSection } from "@/workspaces/library/order-availability/PickupDateClosureSection";
import { WaitingListAvailabilitySection } from "@/workspaces/library/order-availability/WaitingListAvailabilitySection";
import {
  ProductionCapacitySection,
  resolveCapacityDate,
} from "@/workspaces/library/order-availability/capacity/ProductionCapacitySection";
import { ProductionCapacityHistorySection } from "@/workspaces/library/order-availability/capacity/ProductionCapacityHistorySection";
import { AvailabilityOverviewSection } from "@/workspaces/library/order-availability/overview/AvailabilityOverviewSection";
import { WaitingListSection } from "@/workspaces/waiting-list/WaitingListSection";

export const dynamic = "force-dynamic";

type BakeryAvailabilityPageProps = {
  searchParams: Promise<{
    month?: string | string[];
    date?: string | string[];
    overviewFrom?: string | string[];
    wlCake?: string | string[];
    wlStatus?: string | string[];
    wlSize?: string | string[];
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
  const date = firstQueryDateParam(params.date);
  const month = parseOrderAvailabilityMonth(
    parseBusinessDate(date) ? date.slice(0, 7) : firstQueryParam(params.month),
    today,
  );
  const overviewFrom = firstQueryDateParam(params.overviewFrom);
  const wlCake = firstQueryParam(params.wlCake);
  const wlSize = firstQueryParam(params.wlSize);
  const wlStatus = firstQueryParam(params.wlStatus);
  const pickupDate = resolveCapacityDate(date || undefined, month);
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
      <div className="mt-6 space-y-6">
        <PageHeader
          description="Production limits, waiting-list availability, and commercial remaining for a pickup date."
          title="Availability"
        />
        <PagePanel>
          <AvailabilityDateBar
            month={month}
            pickupDate={pickupDate}
            wlCake={wlCake}
            wlSize={wlSize}
            wlStatus={wlStatus}
          />
        </PagePanel>
        <AvailabilitySectionNav />
        <PagePanel>
          <PickupDateClosureSection
            canMutate={canMutate}
            pickupDate={pickupDate}
          />
          <div className="border-fog mt-6 border-t pt-6">
            <ProductionCapacitySection
              canConfigureWaitingList={canConfigureQueue}
              canMutate={canMutate}
              dateParam={date || undefined}
              month={month}
            />
          </div>
        </PagePanel>
        <PagePanel>
          <WaitingListAvailabilitySection
            dateParam={date || undefined}
            month={month}
          />
          {canViewQueue ? (
            <div className="border-fog mt-6 border-t pt-6">
              <WaitingListSection
                cakeParam={wlCake || undefined}
                canConfigure={canConfigureQueue}
                canManage={canManageQueue}
                dateParam={date || undefined}
                month={month}
                sizeParam={wlSize || undefined}
                statusParam={wlStatus || undefined}
              />
            </div>
          ) : null}
        </PagePanel>
        <PagePanel>
          <AvailabilityOverviewSection
            dateParam={date || undefined}
            fromParam={overviewFrom || undefined}
            month={month}
          />
        </PagePanel>
        <PagePanel>
          <ProductionCapacityHistorySection
            dateParam={date || undefined}
            month={month}
          />
        </PagePanel>
      </div>
    </div>
  );
}
