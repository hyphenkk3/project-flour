import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { CatalogueEditForm } from "@/workspaces/library/collections/CatalogueEditForm";
import { CataloguePastMenuVisibilityPanel } from "@/workspaces/library/collections/CataloguePastMenuVisibilityPanel";
import { catalogueDisplayTitle } from "@/workspaces/library/collections/catalogue";
import { getLibraryCollectionById } from "@/workspaces/library/collections/queries";

export const dynamic = "force-dynamic";

type EditCataloguePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditLibraryCataloguePage({
  params,
}: EditCataloguePageProps) {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }

  const { id } = await params;
  const collection = await getLibraryCollectionById(id);
  if (!collection) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Link
        className="text-skyline hover:text-ink text-sm font-medium"
        href={`/library/collections/${collection.id}`}
      >
        ← {catalogueDisplayTitle(collection)}
      </Link>
      <PageHeader
        description="Correct the catalogue name. Type, dates, website override, cakes, and status stay as they are."
        title="Edit catalogue"
      />
      <CatalogueEditForm
        collectionId={collection.id}
        name={collection.name}
        purpose={collection.purpose}
      />
      <CataloguePastMenuVisibilityPanel collection={collection} />
    </div>
  );
}
