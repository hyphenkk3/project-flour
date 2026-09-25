"use client";

import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { CatalogueOrderType } from "@/types/catalogue-voucher";
import {
  CatalogueVoucherAmountLines,
} from "@/workspaces/storefront/offers/CatalogueVoucherAmountLines";
import {
  useEligibleCatalogueVoucher,
  type CatalogueVoucherCartDraft,
} from "@/workspaces/storefront/offers/useEligibleCatalogueVoucher";

export function CatalogueVoucherCartTotals({
  draft,
  commercialTotal,
  orderType = "preorder",
}: {
  draft: CatalogueVoucherCartDraft;
  commercialTotal: number;
  orderType?: CatalogueOrderType;
}) {
  const voucher = useEligibleCatalogueVoucher(draft, orderType);
  if (voucher) {
    return (
      <dl className="space-y-3 text-sm">
        <CatalogueVoucherAmountLines
          commercialTotal={commercialTotal}
          emphasizeTotal
          voucher={voucher}
        />
      </dl>
    );
  }
  return (
    <dl className="space-y-3 text-sm">
      <div className="flex items-baseline justify-between gap-3 pt-1">
        <dt className="text-ink text-sm">Total</dt>
        <dd className="text-ink font-display text-xl tracking-tight tabular-nums">
          {formatRm(commercialTotal)}
        </dd>
      </div>
    </dl>
  );
}
