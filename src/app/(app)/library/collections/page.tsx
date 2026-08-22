import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  isCatalogueExpired,
  isEffectivelyArchived,
} from "@/engines/menu/customer-browse";
import { toBusinessDateKey } from "@/lib/dates";
import { sortByCatalogueDisplayOrder } from "@/workspaces/library/collections/catalogue";
import {
  CollectionsDirectory,
  type CollectionDirectoryItem,
} from "@/workspaces/library/collections/CollectionsDirectory";
import {
  countCakesByCollection,
  getStorefrontCurrentCollectionId,
  listLibraryCollections,
} from "@/workspaces/library/collections/queries";

export const dynamic = "force-dynamic";

type LibraryCollectionsPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function LibraryCollectionsPage({
  searchParams,
}: LibraryCollectionsPageProps) {
  const staff = await requireStaff();
  const canManage = canManageLibrary(staff.role.code);
  const params = await searchParams;
  const archivedView = params.view === "archived";
  let collections: CollectionDirectoryItem[] = [];
  let loadError: string | null = null;

  try {
    const [rows, counts, currentId] = await Promise.all([
      listLibraryCollections(),
      countCakesByCollection(),
      getStorefrontCurrentCollectionId(),
    ]);
    const todayYmd = toBusinessDateKey();
    const mapped = rows.map((collection) => ({
      ...collection,
      cakeCount: counts[collection.id] ?? 0,
      isCurrentStorefront: collection.id === currentId,
      isPastMenu: isCatalogueExpired(collection, todayYmd),
    }));
    const hasDisplayOrder = mapped.some(
      (collection) => collection.displayOrder != null,
    );
    const visible = mapped.filter((collection) =>
      archivedView
        ? isEffectivelyArchived(collection, todayYmd)
        : !isEffectivelyArchived(collection, todayYmd),
    );
    if (hasDisplayOrder) {
      collections = sortByCatalogueDisplayOrder(visible);
    } else {
      const current = visible.filter(
        (collection) => collection.isCurrentStorefront,
      );
      const rest = visible.filter(
        (collection) => !collection.isCurrentStorefront,
      );
      collections = [...current, ...rest];
    }
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Could not load catalogues.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          description="Build and manage the cake catalogues offered to customers. Add existing cakes from the Master Library."
          title="Catalogues"
        />
        {canManage ? (
                    <Link
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium transition"
          href="/library/collections/new"
        >
          + New Catalogue
        </Link>
        ) : null}
      </div>

      <nav className="flex gap-4 text-sm font-medium">
        <Link
          className={
            archivedView
              ? "text-skyline hover:text-ink"
              : "text-ink underline decoration-2 underline-offset-4"
          }
          href="/library/collections"
        >
          Active
        </Link>
        <Link
          className={
            archivedView
              ? "text-ink underline decoration-2 underline-offset-4"
              : "text-skyline hover:text-ink"
          }
          href="/library/collections?view=archived"
        >
          Archived
        </Link>
      </nav>

      {loadError ? (
        <EmptyState description={loadError} title="Catalogues unavailable" />
      ) : (
        <CollectionsDirectory
          collections={collections}
          canManage={canManage}
          variant={archivedView ? "archived" : "active"}
        />
      )}
    </div>
  );
}
