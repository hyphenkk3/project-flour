import { PageHeader } from "@/components/shell/PageHeader";
import type { LibraryAsset } from "@/types/library-asset";
import { listAssets } from "@/workspaces/library/assets/queries";
import { VoucherForm } from "@/workspaces/library/vouchers/VoucherForm";

export const dynamic = "force-dynamic";

export default async function NewLibraryVoucherPage() {
  let assets: LibraryAsset[] = [];
  try {
    assets = await listAssets();
  } catch {
    assets = [];
  }

  return (
    <div className="space-y-6">
      <PageHeader
        description="Create a reusable voucher record."
        title="Add voucher"
      />
      <VoucherForm
        assets={assets}
        cancelHref="/library/vouchers"
        mode="create"
      />
    </div>
  );
}
