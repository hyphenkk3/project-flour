import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DeleteLibraryItemButton } from "@/workspaces/library/DeleteLibraryItemButton";
import {
  libraryStatusTone,
  voucherStatusLabel,
  voucherTypeLabel,
} from "@/workspaces/library/labels";
import { deleteVoucherAction } from "@/workspaces/library/vouchers/actions";
import { getVoucherById } from "@/workspaces/library/vouchers/queries";

export const dynamic = "force-dynamic";

type VoucherDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function LibraryVoucherDetailPage({
  params,
}: VoucherDetailPageProps) {
  const staff = await requireStaff();
  const canManage = canManageLibrary(staff.role.code);
  const { id } = await params;
  const voucher = await getVoucherById(id);

  if (!voucher) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            className="text-skyline hover:text-ink text-sm font-medium"
            href="/library/vouchers"
          >
            ← Voucher Library
          </Link>
          <div className="mt-3">
            <StatusBadge
              label={voucherStatusLabel(voucher.status)}
              tone={libraryStatusTone(voucher.status)}
            />
          </div>
          <PageHeader title={voucher.code} />
        </div>
        <div className="flex flex-wrap gap-3">
          {canManage ? (
            <>

          <Link
            className="bg-ink text-mist hover:bg-skyline inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium"
            href={`/library/vouchers/${voucher.id}/edit`}
          >
            Edit
          </Link>
          <DeleteLibraryItemButton
            action={deleteVoucherAction.bind(null, voucher.id)}
          />
                    </>
          ) : null}
        </div>
      </div>

      <dl className="border-fog grid gap-4 rounded-xl border bg-white p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-skyline">Type</dt>
          <dd className="text-ink mt-1">
            {voucherTypeLabel(voucher.voucherType)}
          </dd>
        </div>
        <div>
          <dt className="text-skyline">Value</dt>
          <dd className="text-ink mt-1">{voucher.value}</dd>
        </div>
        <div>
          <dt className="text-skyline">Valid from</dt>
          <dd className="text-ink mt-1">{voucher.validFrom ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-skyline">Valid until</dt>
          <dd className="text-ink mt-1">{voucher.validUntil ?? "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-skyline">Image URL</dt>
          <dd className="text-ink mt-1 break-all">
            {voucher.imageUrl ? (
              <a
                className="text-signal hover:text-ink"
                href={voucher.imageUrl}
                rel="noreferrer"
                target="_blank"
              >
                {voucher.imageUrl}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-skyline">Linked asset</dt>
          <dd className="text-ink mt-1">
            {voucher.assetId ? (
              <Link
                className="text-signal hover:text-ink font-medium"
                href={`/library/assets/${voucher.assetId}`}
              >
                View asset →
              </Link>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
