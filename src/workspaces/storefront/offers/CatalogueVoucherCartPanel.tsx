"use client";

import Link from "next/link";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type { CatalogueOrderType } from "@/types/catalogue-voucher";
import {
  useEligibleCatalogueVoucher,
  type CatalogueVoucherCartDraft,
} from "@/workspaces/storefront/offers/useEligibleCatalogueVoucher";

export type { CatalogueVoucherCartDraft };

export function CatalogueVoucherCartPanel({
  draft,
  orderType = "preorder",
}: {
  draft: CatalogueVoucherCartDraft;
  orderType?: CatalogueOrderType;
}) {
  const voucher = useEligibleCatalogueVoucher(draft, orderType);
  if (!voucher) return null;

  return (
    <div className="border-fog space-y-2 rounded-[10px] border bg-white px-4 py-3">
      <p className="text-signal text-[11px] font-medium tracking-[0.16em] uppercase">
        Voucher applied
      </p>
      <p className="text-ink text-sm font-medium">
        {voucher.headline} — {voucher.code}
      </p>
      <p className="text-skyline text-sm">
        This order qualifies for this voucher.
      </p>
      <p className="text-ink text-sm font-medium tabular-nums">
        - {formatRm(Math.abs(voucher.amount))}
      </p>
      <p>
        <Link className="text-skyline text-sm" href="/offers">
          View details
        </Link>
      </p>
    </div>
  );
}
