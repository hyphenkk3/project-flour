import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { AssetForm } from "@/workspaces/library/assets/AssetForm";

export const dynamic = "force-dynamic";

export default async function NewLibraryAssetPage() {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        description="Create a reusable image asset."
        title="Add asset"
      />
      <AssetForm cancelHref="/library/assets" mode="create" />
    </div>
  );
}
