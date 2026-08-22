import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DeleteLibraryItemButton } from "@/workspaces/library/DeleteLibraryItemButton";
import {
  libraryStatusTone,
  promotionStatusLabel,
} from "@/workspaces/library/labels";
import { deletePromotionAction } from "@/workspaces/library/promotions/actions";
import { getPromotionById } from "@/workspaces/library/promotions/queries";

export const dynamic = "force-dynamic";

type PromotionDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function LibraryPromotionDetailPage({
  params,
}: PromotionDetailPageProps) {
  const staff = await requireStaff();
  const canManage = canManageLibrary(staff.role.code);
  const { id } = await params;
  const promotion = await getPromotionById(id);

  if (!promotion) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            className="text-skyline hover:text-ink text-sm font-medium"
            href="/library/promotions"
          >
            ← Promotion Library
          </Link>
          <div className="mt-3">
            <StatusBadge
              label={promotionStatusLabel(promotion.status)}
              tone={libraryStatusTone(promotion.status)}
            />
          </div>
          <PageHeader title={promotion.name} />
        </div>
        <div className="flex flex-wrap gap-3">
          {canManage ? (
            <>

          <Link
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium"
            href={`/library/promotions/${promotion.id}/edit`}
          >
            Edit
          </Link>
          <DeleteLibraryItemButton
            action={deletePromotionAction.bind(null, promotion.id)}
          />
                    </>
          ) : null}
        </div>
      </div>

      <dl className="border-fog grid gap-4 rounded-xl border bg-white p-5 text-sm">
        <div>
          <dt className="text-skyline">Description</dt>
          <dd className="text-ink mt-1 whitespace-pre-wrap">
            {promotion.description ?? "—"}
          </dd>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-skyline">Valid from</dt>
            <dd className="text-ink mt-1">{promotion.validFrom ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-skyline">Valid until</dt>
            <dd className="text-ink mt-1">{promotion.validUntil ?? "—"}</dd>
          </div>
        </div>
      </dl>
    </div>
  );
}
