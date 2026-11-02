import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { AddonCatalogueManager } from "@/workspaces/library/addons/AddonCatalogueManager";
import { loadAddonCatalogue } from "@/workspaces/library/addons/queries";
import { getKuchingBusinessDate } from "@/workspaces/library/addons/collection-dates.mjs";

export const dynamic = "force-dynamic";

export default async function LibraryAddonsPage() {
  const staff = await requireStaff();
  if (staff.role.code !== "owner" || !staff.isActive || staff.archivedAt) {
    redirect("/home");
  }
  const catalogue = await loadAddonCatalogue();
  const businessToday = getKuchingBusinessDate();

  return (
    <div className="space-y-6">
      <PageHeader
        description="Manage separate complimentary and paid add-on catalogues, collection availability, and inclusive seasonal dates. Only active Owners can make changes."
        title="Complimentary & paid add-ons"
      />
      <AddonCatalogueManager {...catalogue} businessToday={businessToday} />
    </div>
  );
}
