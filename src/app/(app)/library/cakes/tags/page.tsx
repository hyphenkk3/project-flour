import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { EmptyState } from "@/components/ui/EmptyState";
import { CakeTagManager } from "@/workspaces/library/cakes/CakeTagManager";
import {
  countCakesByTagId,
  listCakeTags,
} from "@/workspaces/library/cakes/queries";

export const dynamic = "force-dynamic";

export default async function LibraryCakeTagsPage() {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }

  let loadError: string | null = null;
  const tags = await listCakeTags().catch((error: unknown) => {
    loadError =
      error instanceof Error ? error.message : "Could not load cake tags.";
    return [];
  });
  const counts = loadError
    ? new Map<string, number>()
    : await countCakesByTagId().catch(() => new Map<string, number>());

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
          description="Add, rename, reorder, and deactivate merchandising tags. Assigned cakes keep their tag when you deactivate it."
          title="Manage tags"
        />
      </div>
      {loadError ? (
        <EmptyState description={loadError} title="Cake tags unavailable" />
      ) : (
        <CakeTagManager cakeCounts={cakeCounts} tags={tags} />
      )}
    </div>
  );
}
