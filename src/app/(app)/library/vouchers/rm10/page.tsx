import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageRm10PhysicalCards } from "@/foundation/navigation/access";
import { EmptyState } from "@/components/ui/EmptyState";
import { VoucherLibraryTabs } from "@/workspaces/library/vouchers/VoucherLibraryTabs";
import { Rm10PhysicalDirectory } from "@/workspaces/library/vouchers/rm10/Rm10PhysicalDirectory";
import { listRm10LibraryRows } from "@/workspaces/library/vouchers/rm10/queries";
import type { Rm10LibraryRow } from "@/types/rm10-physical-voucher";

export const dynamic = "force-dynamic";

export default async function LibraryRm10VouchersPage() {
  const staff = await requireStaff();
  if (!canManageRm10PhysicalCards(staff.role.code)) {
    redirect("/library/vouchers");
  }

  let rows: Rm10LibraryRow[] = [];
  let loadError: string | null = null;

  try {
    rows = await listRm10LibraryRows();
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Could not load RM10 Physical Cards. Apply the voucher library migration.";
  }

  return (
    <div className="space-y-6">
      <VoucherLibraryTabs active="rm10" showRm10 />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          description="Managed RM10 cards and historical redemptions. Usage comes from actual RM10 order adjustments."
          title="RM10 Physical Cards"
        />
        <Link
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium transition"
          href="/library/vouchers/rm10/new"
        >
          Add RM10 cards
        </Link>
      </div>

      {loadError ? (
        <EmptyState
          description={loadError}
          title="RM10 Physical Cards unavailable"
        />
      ) : (
        <Rm10PhysicalDirectory rows={rows} />
      )}
    </div>
  );
}
