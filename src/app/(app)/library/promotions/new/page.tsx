import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { PromotionForm } from "@/workspaces/library/promotions/PromotionForm";

export const dynamic = "force-dynamic";

export default async function NewLibraryPromotionPage() {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        description="Create a reusable promotion record."
        title="Add promotion"
      />
      <PromotionForm cancelHref="/library/promotions" mode="create" />
    </div>
  );
}
