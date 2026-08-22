import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { AssetForm } from "@/workspaces/library/assets/AssetForm";
import { getAssetById } from "@/workspaces/library/assets/queries";

export const dynamic = "force-dynamic";

type EditAssetPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditLibraryAssetPage({
  params,
}: EditAssetPageProps) {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }

  const { id } = await params;
  const asset = await getAssetById(id);

  if (!asset) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          className="text-skyline hover:text-ink text-sm font-medium"
          href={`/library/assets/${asset.id}`}
        >
          ← {asset.title}
        </Link>
        <PageHeader
          description="Update this reusable image asset."
          title="Edit asset"
        />
      </div>
      <AssetForm
        asset={asset}
        cancelHref={`/library/assets/${asset.id}`}
        mode="edit"
      />
    </div>
  );
}
