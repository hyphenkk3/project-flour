import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CollectionBuilder } from "@/workspaces/library/collections/CollectionBuilder";
import { CatalogueArchiveButton } from "@/workspaces/library/collections/CatalogueArchiveButton";
import { CataloguePublishButton } from "@/workspaces/library/collections/CataloguePublishButton";
import { CatalogueRestoreButton } from "@/workspaces/library/collections/CatalogueRestoreButton";
import { CatalogueUnpublishButton } from "@/workspaces/library/collections/CatalogueUnpublishButton";
import { CataloguePastMenuVisibilityPanel } from "@/workspaces/library/collections/CataloguePastMenuVisibilityPanel";
import { CatalogueWebsiteOverridePanel } from "@/workspaces/library/collections/CatalogueWebsiteOverridePanel";
import {
  CATALOGUE_ARCHIVED_QUERY,
  CATALOGUE_COPIED_QUERY,
  CATALOGUE_PUBLISHED_QUERY,
  CATALOGUE_RESTORED_QUERY,
  CATALOGUE_PAST_MENU_QUERY,
  CATALOGUE_UNPUBLISHED_QUERY,
  CATALOGUE_UPDATED_QUERY,
  catalogueDisplayTitle,
  cataloguePurposeLabel,
  formatCatalogueCalendarDate,
  isPublishedSpecialWebsiteOverride,
} from "@/workspaces/library/collections/catalogue";
import {
  getLibraryCollectionById,
  getStorefrontCurrentCollectionId,
  listCollectionCakeRows,
} from "@/workspaces/library/collections/queries";
import { listCakes } from "@/workspaces/library/cakes/queries";
import {
  collectionStatusLabel,
  formatLibraryCollectionMonth,
  libraryStatusTone,
} from "@/workspaces/library/labels";

export const dynamic = "force-dynamic";

type CollectionBuilderPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    copied?: string;
    published?: string;
    unpublished?: string;
    updated?: string;
    archived?: string;
    restored?: string;
    "past-menu"?: string;
  }>;
};

export default async function LibraryCollectionBuilderPage({
  params,
  searchParams,
}: CollectionBuilderPageProps) {
  const staff = await requireStaff();
  const canManage = canManageLibrary(staff.role.code);
  const { id } = await params;
  const query = await searchParams;
  const collection = await getLibraryCollectionById(id);

  if (!collection) {
    notFound();
  }

  const [members, libraryCakes, currentId] = await Promise.all([
    listCollectionCakeRows(collection.id),
    listCakes(),
    getStorefrontCurrentCollectionId(),
  ]);
  const isWebsiteCatalogue = currentId === collection.id;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            className="text-skyline hover:text-ink text-sm font-medium"
            href="/library/collections"
          >
            ← Catalogues
          </Link>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-4">
              <Link
                className="text-signal hover:text-ink text-sm font-medium"
                href={`/library/collections/${collection.id}/edit`}
              >
                Edit
              </Link>
              {collection.purpose === "monthly" ? (
                <Link
                  className="text-signal hover:text-ink text-sm font-medium"
                  href={`/library/collections/new?copyFrom=${collection.id}`}
                >
                  Copy catalogue
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StatusBadge
            label={collectionStatusLabel(collection.status)}
            tone={libraryStatusTone(collection.status)}
          />
          <StatusBadge
            label={cataloguePurposeLabel(collection.purpose)}
            tone="neutral"
          />
          {isPublishedSpecialWebsiteOverride(collection) ? (
            <StatusBadge label="Website Override" tone="info" />
          ) : null}
          {isWebsiteCatalogue ? (
            <StatusBadge label="Website Catalogue" tone="info" />
          ) : null}
        </div>
        {collection.status === "draft" ? (
          <div className="mt-4">
            <CataloguePublishButton
              collectionId={collection.id}
              purpose={collection.purpose}
            />
          </div>
        ) : null}
        {collection.status === "active" ? (
          <div className="mt-4">
            <CatalogueUnpublishButton collectionId={collection.id} />
          </div>
        ) : null}
        {collection.status === "draft" ? (
          <div className="mt-4">
            <CatalogueArchiveButton collectionId={collection.id} />
          </div>
        ) : null}
        {collection.status === "archived" ? (
          <div className="mt-4">
            <CatalogueRestoreButton collectionId={collection.id} />
          </div>
        ) : null}
        <PageHeader
          description="Adding a cake here offers it in this catalogue only. It does not copy the cake or change Library status."
          title={catalogueDisplayTitle(collection)}
        />
        {query[CATALOGUE_PUBLISHED_QUERY] === "1" ? (
          <p
            className="border-fog mt-4 max-w-2xl rounded-xl border bg-white px-4 py-3 text-sm text-ink"
            role="status"
          >
            Catalogue published. Status is now Active.
            {collection.purpose === "special"
              ? " This does not replace the monthly website catalogue unless Website override is on."
              : " An Active monthly catalogue can become the website catalogue for its month."}
          </p>
        ) : null}
        {query[CATALOGUE_UNPUBLISHED_QUERY] === "1" ? (
          <p
            className="border-fog mt-4 max-w-2xl rounded-xl border bg-white px-4 py-3 text-sm text-ink"
            role="status"
          >
            Catalogue unpublished. Status is now Draft.
          </p>
        ) : null}
        {query[CATALOGUE_UPDATED_QUERY] === "1" ? (
          <p
            className="border-fog mt-4 max-w-2xl rounded-xl border bg-white px-4 py-3 text-sm text-ink"
            role="status"
          >
            Catalogue name saved.
          </p>
        ) : null}
        {query[CATALOGUE_PAST_MENU_QUERY] === "1" ? (
          <p
            className="border-fog mt-4 max-w-2xl rounded-xl border bg-white px-4 py-3 text-sm text-ink"
            role="status"
          >
            Browse Menu visibility saved. This does not change whether customers
            can order from this catalogue.
          </p>
        ) : null}
        {query[CATALOGUE_ARCHIVED_QUERY] === "1" ? (
          <p
            className="border-fog mt-4 max-w-2xl rounded-xl border bg-white px-4 py-3 text-sm text-ink"
            role="status"
          >
            Catalogue archived. It is hidden from the active list and customer
            ordering. Existing orders and cakes are unchanged.
          </p>
        ) : null}
        {query[CATALOGUE_RESTORED_QUERY] === "1" ? (
          <p
            className="border-fog mt-4 max-w-2xl rounded-xl border bg-white px-4 py-3 text-sm text-ink"
            role="status"
          >
            Catalogue restored as Draft. Publish it again if customers should
            see it.
          </p>
        ) : null}
        {query[CATALOGUE_COPIED_QUERY] === "1" ? (
          <p
            className="border-fog mt-4 max-w-2xl rounded-xl border bg-white px-4 py-3 text-sm text-ink"
            role="status"
          >
            Catalogue copied. It starts with the same cakes and order as the
            previous monthly catalogue. It is Draft, so it does not replace the
            website catalogue. You can add, remove, or reorder cakes here.
          </p>
        ) : null}
        <dl className="text-skyline mt-3 grid max-w-xl gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink font-medium">Catalogue type</dt>
            <dd>{cataloguePurposeLabel(collection.purpose)}</dd>
          </div>
          {collection.purpose === "monthly" && collection.month ? (
            <div>
              <dt className="text-ink font-medium">Month</dt>
              <dd>{formatLibraryCollectionMonth(collection.month)}</dd>
            </div>
          ) : null}
          {collection.purpose === "special" && collection.startDate ? (
            <div>
              <dt className="text-ink font-medium">Start date</dt>
              <dd>{formatCatalogueCalendarDate(collection.startDate)}</dd>
            </div>
          ) : null}
          {collection.purpose === "special" && collection.endDate ? (
            <div>
              <dt className="text-ink font-medium">End date</dt>
              <dd>{formatCatalogueCalendarDate(collection.endDate)}</dd>
            </div>
          ) : null}
          {collection.purpose === "special" ? (
            <div>
              <dt className="text-ink font-medium">Website override</dt>
              <dd>
                {collection.websiteOverride
                  ? "Published as website override during these dates"
                  : "Off — keep this catalogue internal"}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      {collection.purpose === "special" && collection.status !== "archived" ? (
        <CatalogueWebsiteOverridePanel collection={collection} />
      ) : null}

      <CataloguePastMenuVisibilityPanel collection={collection} />

      <CollectionBuilder
        collection={collection}
        isWebsiteCatalogue={isWebsiteCatalogue}
        libraryCakes={libraryCakes}
        members={members}
      />
    </div>
  );
}
