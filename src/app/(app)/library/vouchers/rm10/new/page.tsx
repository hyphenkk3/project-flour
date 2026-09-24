import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageRm10PhysicalCards } from "@/foundation/navigation/access";
import { VoucherLibraryTabs } from "@/workspaces/library/vouchers/VoucherLibraryTabs";
import { Rm10PhysicalForm } from "@/workspaces/library/vouchers/rm10/Rm10PhysicalForm";

export const dynamic = "force-dynamic";

export default async function NewLibraryRm10VoucherPage() {
  const staff = await requireStaff();
  if (!canManageRm10PhysicalCards(staff.role.code)) {
    redirect("/library/vouchers");
  }

  return (
    <div className="space-y-6">
      <VoucherLibraryTabs active="rm10" showRm10 />
      <PageHeader
        description="Add one voucher, a number range, or a pasted list. Existing numbers are not overwritten."
        title="Add RM10 Physical Cards"
      />
      <Rm10PhysicalForm />
    </div>
  );
}
