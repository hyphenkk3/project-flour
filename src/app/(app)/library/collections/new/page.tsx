import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { CatalogueForm } from "@/workspaces/library/collections/CatalogueForm";
import {
  monthlyCopySources,
  parseCatalogueCopyFromValue,
  type MonthlyCopySource,
} from "@/workspaces/library/collections/catalogue";
import { listLibraryCollections } from "@/workspaces/library/collections/queries";

export const dynamic = "force-dynamic";

type NewLibraryCataloguePageProps = {
  searchParams: Promise<{ copyFrom?: string }>;
};

export default async function NewLibraryCataloguePage({
  searchParams,
}: NewLibraryCataloguePageProps) {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }
  const params = await searchParams;
  let sources: MonthlyCopySource[] = [];
  try {
    const collections = await listLibraryCollections();
    sources = monthlyCopySources(
      collections.flatMap((collection) =>
        collection.month
          ? [
              {
                id: collection.id,
                name: collection.name,
                month: collection.month,
                createdAt: collection.createdAt,
                purpose: collection.purpose,
              },
            ]
          : [],
      ),
    );
  } catch {
    sources = [];
  }

  const requested = parseCatalogueCopyFromValue(params.copyFrom ?? "");
  const defaultCopyFromId =
    requested.kind === "id" && sources.some((source) => source.id === requested.id)
      ? requested.id
      : "";

  return (
    <div className="space-y-6">
      <PageHeader
        description="Create a monthly or special-occasion cake catalogue. Monthly catalogues can start empty or copy cakes and ordering from a previous monthly catalogue."
        title="New Catalogue"
      />
      <CatalogueForm
        cancelHref="/library/collections"
        defaultCopyFromId={defaultCopyFromId}
        monthlyCopySources={sources}
      />
    </div>
  );
}
