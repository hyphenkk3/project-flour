import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { EmptyState } from "@/components/ui/EmptyState";
import type { LibraryCake } from "@/types/library-cake";
import { CakeDirectory } from "@/workspaces/library/cakes/CakeDirectory";
import { listCakes } from "@/workspaces/library/cakes/queries";

export const dynamic = "force-dynamic";

export default async function LibraryCakesPage() {
  const staff = await requireStaff();
  const canManage = canManageLibrary(staff.role.code);
  let cakes: LibraryCake[] = [];
  let loadError: string | null = null;

  try {
    cakes = await listCakes();
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Could not load cakes. Apply the Master Library migration.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          description="Reusable cakes to offer in catalogues."
          title="Cake Library"
        />
        {canManage ? (
          <Link
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium transition"
            href="/library/cakes/new"
          >
            Add cake
          </Link>
        ) : null}
      </div>

      {loadError ? (
        <EmptyState description={loadError} title="Cake Library unavailable" />
      ) : (
        <CakeDirectory cakes={cakes} canManage={canManage} />
      )}
    </div>
  );
}
