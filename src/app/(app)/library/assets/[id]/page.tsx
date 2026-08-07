import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { deleteAssetAction } from "@/workspaces/library/assets/actions";
import { getAssetById } from "@/workspaces/library/assets/queries";
import { DeleteLibraryItemButton } from "@/workspaces/library/DeleteLibraryItemButton";
import {
  assetKindLabel,
  assetStatusLabel,
  libraryStatusTone,
} from "@/workspaces/library/labels";

export const dynamic = "force-dynamic";

type AssetDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function LibraryAssetDetailPage({
  params,
}: AssetDetailPageProps) {
  const { id } = await params;
  const asset = await getAssetById(id);

  if (!asset) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            className="text-skyline hover:text-ink text-sm font-medium"
            href="/library/assets"
          >
            ← Asset Library
          </Link>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge
              label={assetStatusLabel(asset.status)}
              tone={libraryStatusTone(asset.status)}
            />
            <StatusBadge label={assetKindLabel(asset.kind)} tone="neutral" />
          </div>
          <PageHeader title={asset.title} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium"
            href={`/library/assets/${asset.id}/edit`}
          >
            Edit
          </Link>
          <DeleteLibraryItemButton
            action={deleteAssetAction.bind(null, asset.id)}
          />
        </div>
      </div>

      <dl className="border-fog grid gap-4 rounded-xl border bg-white p-5 text-sm">
        <div>
          <dt className="text-skyline">Image URL</dt>
          <dd className="text-ink mt-1 break-all">
            <a
              className="text-signal hover:text-ink"
              href={asset.imageUrl}
              rel="noreferrer"
              target="_blank"
            >
              {asset.imageUrl}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-skyline">Alt text</dt>
          <dd className="text-ink mt-1 whitespace-pre-wrap">
            {asset.altText ?? "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
