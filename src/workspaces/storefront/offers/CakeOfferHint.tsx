import Link from "next/link";
import {
  formatCatalogueVoucherHeadline,
  isCatalogueVoucherDiscoverable,
  summarizeCatalogueVoucherRules,
} from "@/engines/vouchers/catalogue-voucher";
import { singaporeDateFromIso } from "@/engines/orders/promotions";
import {
  listPublicCatalogueVouchers,
  voucherRelevantToCake,
} from "@/workspaces/vouchers/catalogue-queries";

export async function CakeOfferHint({ cakeId }: { cakeId: string }) {
  const today = singaporeDateFromIso(new Date().toISOString());
  const vouchers = (await listPublicCatalogueVouchers()).filter(
    (voucher) =>
      isCatalogueVoucherDiscoverable(voucher, today) &&
      voucherRelevantToCake(voucher, cakeId),
  );
  if (vouchers.length === 0) return null;
  const voucher = vouchers[0];
  const details = summarizeCatalogueVoucherRules(voucher);

  return (
    <aside className="border-fog mt-6 rounded-[10px] border bg-white px-4 py-3">
      <p className="text-signal text-[11px] font-medium tracking-[0.16em] uppercase">
        {formatCatalogueVoucherHeadline(voucher)}
      </p>
      <p className="text-ink mt-1 text-sm font-medium">{voucher.code}</p>
      {details.length > 0 ? (
        <p className="text-skyline mt-1 text-sm">{details.join(" · ")}</p>
      ) : null}
      <p className="mt-2">
        <Link className="text-ink hover:text-skyline text-sm font-medium" href="/offers">
          View details
        </Link>
      </p>
    </aside>
  );
}
