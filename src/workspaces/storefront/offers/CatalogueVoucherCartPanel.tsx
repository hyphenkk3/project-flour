"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  formatCatalogueVoucherHeadline,
} from "@/engines/vouchers/catalogue-voucher";
import { evaluateDraftCatalogueVouchers } from "@/engines/vouchers/catalogue-voucher-context";
import { singaporeDateFromIso } from "@/engines/orders/promotions";
import { formatRm } from "@/workspaces/storefront/catalog/pricing";
import type {
  CatalogueOrderType,
  CatalogueVoucherRecord,
} from "@/types/catalogue-voucher";
import {
  readSelectedCatalogueVoucherId,
  subscribeCatalogueVoucherSelection,
  writeSelectedCatalogueVoucherId,
} from "@/workspaces/storefront/offers/catalogue-voucher-selection";
import { listPublicCatalogueVouchersAction } from "@/workspaces/vouchers/catalogue-actions";

export type CatalogueVoucherCartDraft = {
  pickupDate: string;
  items: Array<{
    cakeId: string;
    sizeId: string;
    sizeLabel: string;
    quantity: number;
    unitPrice: number;
  }>;
};

export function CatalogueVoucherCartPanel({
  draft,
  orderType = "preorder",
}: {
  draft: CatalogueVoucherCartDraft;
  orderType?: CatalogueOrderType;
}) {
  const [vouchers, setVouchers] = useState<CatalogueVoucherRecord[]>([]);
  const selectedId = useSyncExternalStore(
    subscribeCatalogueVoucherSelection,
    readSelectedCatalogueVoucherId,
    () => null,
  );

  useEffect(() => {
    void listPublicCatalogueVouchersAction().then(setVouchers);
  }, []);

  const today = singaporeDateFromIso(new Date().toISOString());
  const evaluated = useMemo(
    () => evaluateDraftCatalogueVouchers(vouchers, draft, today, orderType),
    [draft, orderType, today, vouchers],
  );
  const applicable = evaluated.filter((row) => row.result.eligible);
  if (applicable.length === 0) return null;

  return (
    <div className="border-fog space-y-3 rounded-[10px] border bg-white px-4 py-3">
      <p className="text-signal text-[11px] font-medium tracking-[0.16em] uppercase">
        Voucher available
      </p>
      <ul className="space-y-3">
        {applicable.map(({ voucher, result }) => {
          const selected = selectedId === voucher.id;
          return (
            <li key={voucher.id}>
              <p className="text-ink text-sm font-medium">
                {formatCatalogueVoucherHeadline(voucher)} — {voucher.code}
              </p>
              <p className="text-skyline mt-0.5 text-sm">
                This order qualifies for this voucher
                {result.amount != null
                  ? ` (${formatRm(Math.abs(result.amount))} off)`
                  : ""}
                .
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  className="text-ink hover:text-skyline text-sm font-medium"
                  onClick={() => {
                    writeSelectedCatalogueVoucherId(selected ? null : voucher.id);
                  }}
                  type="button"
                >
                  {selected ? "Selected" : "Apply"}
                </button>
                <Link className="text-skyline text-sm" href="/offers">
                  View details
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
