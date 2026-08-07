import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import type { LibraryVoucher } from "@/types/library-voucher";
import { VoucherDirectory } from "@/workspaces/library/vouchers/VoucherDirectory";
import { listVouchers } from "@/workspaces/library/vouchers/queries";

export const dynamic = "force-dynamic";

export default async function LibraryVouchersPage() {
  let vouchers: LibraryVoucher[] = [];
  let loadError: string | null = null;

  try {
    vouchers = await listVouchers();
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Could not load vouchers. Apply the Master Library migration.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          description="Reusable voucher codes for future Collections."
          title="Voucher Library"
        />
        <Link
          className="bg-ink text-mist hover:bg-skyline inline-flex min-h-12 items-center justify-center rounded-lg px-5 text-sm font-medium transition"
          href="/library/vouchers/new"
        >
          Add voucher
        </Link>
      </div>

      {loadError ? (
        <EmptyState
          description={loadError}
          title="Voucher Library unavailable"
        />
      ) : (
        <VoucherDirectory vouchers={vouchers} />
      )}
    </div>
  );
}
