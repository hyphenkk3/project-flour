import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { EmptyState } from "@/components/ui/EmptyState";
import type { LibraryPromotion } from "@/types/library-promotion";
import { PromotionDirectory } from "@/workspaces/library/promotions/PromotionDirectory";
import { listPromotions } from "@/workspaces/library/promotions/queries";

export const dynamic = "force-dynamic";

export default async function LibraryPromotionsPage() {
  const staff = await requireStaff();
  const canManage = canManageLibrary(staff.role.code);
  let promotions: LibraryPromotion[] = [];
  let loadError: string | null = null;

  try {
    promotions = await listPromotions();
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Could not load promotions. Apply the Master Library migration.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          description="Reusable promotions for future catalogues."
          title="Promotion Library"
        />
        {canManage ? (
          <Link
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium transition"
            href="/library/promotions/new"
          >
            Add promotion
          </Link>
        ) : null}
      </div>

      {loadError ? (
        <EmptyState
          description={loadError}
          title="Promotion Library unavailable"
        />
      ) : (
        <PromotionDirectory promotions={promotions} canManage={canManage} />
      )}
    </div>
  );
}
