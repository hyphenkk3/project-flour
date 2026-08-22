import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireStaff } from "@/foundation/auth/session";
import { canManageLibrary } from "@/foundation/navigation/access";
import type { LibraryAsset } from "@/types/library-asset";
import { listAssets } from "@/workspaces/library/assets/queries";
import { VoucherForm } from "@/workspaces/library/vouchers/VoucherForm";
import { getVoucherById } from "@/workspaces/library/vouchers/queries";

export const dynamic = "force-dynamic";

type EditVoucherPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditLibraryVoucherPage({
  params,
}: EditVoucherPageProps) {
  const staff = await requireStaff();
  if (!canManageLibrary(staff.role.code)) {
    redirect("/home");
  }

  const { id } = await params;
  const voucher = await getVoucherById(id);

  if (!voucher) {
    notFound();
  }

  let assets: LibraryAsset[] = [];
  try {
    assets = await listAssets();
  } catch {
    assets = [];
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          className="text-skyline hover:text-ink text-sm font-medium"
          href={`/library/vouchers/${voucher.id}`}
        >
          ← {voucher.code}
        </Link>
        <PageHeader
          description="Update this reusable voucher record."
          title="Edit voucher"
        />
      </div>
      <VoucherForm
        assets={assets}
        cancelHref={`/library/vouchers/${voucher.id}`}
        mode="edit"
        voucher={voucher}
      />
    </div>
  );
}
