import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { CakeForm } from "@/workspaces/library/cakes/CakeForm";
import { listCakeCategories } from "@/workspaces/library/cakes/queries";

export const dynamic = "force-dynamic";

export default async function NewLibraryCakePage() {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }

  const categories = await listCakeCategories();

  return (
    <div className="space-y-6">
      <PageHeader
        description="Create a reusable cake record."
        title="Add cake"
      />
      <CakeForm
        cancelHref="/library/cakes"
        categories={categories}
        mode="create"
      />
    </div>
  );
}
