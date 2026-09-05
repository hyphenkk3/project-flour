import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageCakePhotos, canManageLibrary } from "@/foundation/navigation/access";
import { EmptyState } from "@/components/ui/EmptyState";
import type { LibraryCake } from "@/types/library-cake";
import { CakeDirectory } from "@/workspaces/library/cakes/CakeDirectory";
import { listCakeCategories, listCakes } from "@/workspaces/library/cakes/queries";

export const dynamic = "force-dynamic";

export default async function LibraryCakesPage() {
  const staff = await requireStaff();
  const canManage = canManageLibrary(staff.role.code);
  const canManagePhotos = canManageCakePhotos(staff.role.code);
  let cakes: LibraryCake[] = [];
  let categories: Awaited<ReturnType<typeof listCakeCategories>> = [];
  let loadError: string | null = null;

  try {
    [cakes, categories] = await Promise.all([listCakes(), listCakeCategories()]);
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
          description={
            canManage
              ? "Reusable cakes to offer in catalogues."
              : canManagePhotos
                ? "Open a cake to upload, preview, and manage photos. Cake records stay under Owner and Manager."
                : "Reusable cakes to offer in catalogues."
          }
          title="Cake Library"
        />
        {canManage ? (
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              className="border-fog text-ink hover:border-skyline inline-flex min-h-12 items-center justify-center rounded-lg border bg-white px-5 text-sm font-medium transition"
              href="/library/cakes/categories"
            >
              Manage categories
            </Link>
            <Link
              className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium transition"
              href="/library/cakes/new"
            >
              Add cake
            </Link>
          </div>
        ) : null}
      </div>

      {loadError ? (
        <EmptyState description={loadError} title="Cake Library unavailable" />
      ) : (
        <CakeDirectory
          cakes={cakes}
          canManage={canManage}
          categories={categories}
        />
      )}
    </div>
  );
}
