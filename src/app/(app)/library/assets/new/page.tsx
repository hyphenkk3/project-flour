import { PageHeader } from "@/components/shell/PageHeader";
import { AssetForm } from "@/workspaces/library/assets/AssetForm";

export const dynamic = "force-dynamic";

export default function NewLibraryAssetPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Create a reusable image asset."
        title="Add asset"
      />
      <AssetForm cancelHref="/library/assets" mode="create" />
    </div>
  );
}
