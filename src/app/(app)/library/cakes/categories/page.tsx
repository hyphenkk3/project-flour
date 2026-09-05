import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { EmptyState } from "@/components/ui/EmptyState";
import { CakeCategoryManager } from "@/workspaces/library/cakes/CakeCategoryManager";
import {
  countCakesByCategoryId,
  listCakeCategories,
} from "@/workspaces/library/cakes/queries";

export const dynamic = "force-dynamic";

export default async function LibraryCakeCategoriesPage() {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }

  let loadError: string | null = null;
  let categories = await listCakeCategories().catch((error: unknown) => {
    loadError =
      error instanceof Error
        ? error.message
        : "Could not load cake categories.";
    return [];
  });
  const counts = loadError
    ? new Map<string, number>()
    : await countCakesByCategoryId().catch(() => new Map<string, number>());

  const cakeCounts = Object.fromEntries(counts);

  return (
    <div className="space-y-6">
      <div>
        <Link
          className="text-skyline hover:text-ink text-sm font-medium"
          href="/library/cakes"
        >
          ← Cake Library
        </Link>
        <PageHeader
          description="Add, rename, reorder, and deactivate cake categories. Assigned cakes keep their category when you deactivate it."
          title="Manage categories"
        />
      </div>
      {loadError ? (
        <EmptyState
          description={loadError}
          title="Cake categories unavailable"
        />
      ) : (
        <CakeCategoryManager cakeCounts={cakeCounts} categories={categories} />
      )}
    </div>
  );
}
