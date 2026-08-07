import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { AssetForm } from "@/workspaces/library/assets/AssetForm";
import { getAssetById } from "@/workspaces/library/assets/queries";

export const dynamic = "force-dynamic";

type EditAssetPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditLibraryAssetPage({
  params,
}: EditAssetPageProps) {
  const { id } = await params;
  const asset = await getAssetById(id);

  if (!asset) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          className="text-skyline hover:text-ink text-sm font-medium"
          href={`/library/assets/${asset.id}`}
        >
          ← {asset.title}
        </Link>
        <PageHeader
          description="Update this reusable image asset."
          title="Edit asset"
        />
      </div>
      <AssetForm
        asset={asset}
        cancelHref={`/library/assets/${asset.id}`}
        mode="edit"
      />
    </div>
  );
}
