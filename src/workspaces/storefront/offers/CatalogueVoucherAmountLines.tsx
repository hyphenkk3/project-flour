import { addMoney } from "@/engines/orders/money";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { CatalogueVoucherPreview } from "@/workspaces/storefront/offers/useEligibleCatalogueVoucher";

export function catalogueVoucherPreviewPayable(
  commercialTotal: number,
  voucher: CatalogueVoucherPreview | null,
): number {
  if (!voucher) return commercialTotal;
  return Math.max(0, addMoney(commercialTotal, voucher.amount));
}

export function CatalogueVoucherAmountLines({
  commercialTotal,
  voucher,
  emphasizeTotal = false,
}: {
  commercialTotal: number;
  voucher: CatalogueVoucherPreview | null;
  emphasizeTotal?: boolean;
}) {
  if (!voucher) return null;
  const payable = catalogueVoucherPreviewPayable(commercialTotal, voucher);
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-ink text-sm">Subtotal</dt>
        <dd className="text-ink text-sm font-medium tabular-nums">
          {formatRm(commercialTotal)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-ink text-sm">{voucher.code}</dt>
        <dd className="text-ink text-sm font-medium tabular-nums">
          - {formatRm(Math.abs(voucher.amount))}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-3 pt-1">
        <dt className="text-ink text-sm">Total</dt>
        <dd
          className={
            emphasizeTotal
              ? "text-ink font-display text-xl tracking-tight tabular-nums"
              : "text-ink text-sm font-semibold tabular-nums"
          }
        >
          {formatRm(payable)}
        </dd>
      </div>
    </>
  );
}
