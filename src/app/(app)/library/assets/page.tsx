import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { EmptyState } from "@/components/ui/EmptyState";
import type { LibraryAsset } from "@/types/library-asset";
import { AssetDirectory } from "@/workspaces/library/assets/AssetDirectory";
import { listAssets } from "@/workspaces/library/assets/queries";

export const dynamic = "force-dynamic";

export default async function LibraryAssetsPage() {
  const staff = await requireStaff();
  const canManage = canManageLibrary(staff.role.code);
  let assets: LibraryAsset[] = [];
  let loadError: string | null = null;

  try {
    assets = await listAssets();
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Could not load assets. Apply the Master Library migration.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          description="Reusable images for heroes, covers, and banners."
          title="Asset Library"
        />
        {canManage ? (
          <Link
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium transition"
            href="/library/assets/new"
          >
            Add asset
          </Link>
        ) : null}
      </div>

      {loadError ? (
        <EmptyState description={loadError} title="Asset Library unavailable" />
      ) : (
        <AssetDirectory assets={assets} canManage={canManage} />
      )}
    </div>
  );
}
