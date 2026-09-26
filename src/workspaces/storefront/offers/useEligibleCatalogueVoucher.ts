"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatCatalogueVoucherHeadline,
} from "@/engines/vouchers/catalogue-voucher";
import { selectDraftCatalogueVoucher } from "@/engines/vouchers/catalogue-voucher-context";
import { singaporeDateFromIso } from "@/engines/orders/promotions";
import type {
  CatalogueOrderType,
  CatalogueVoucherRecord,
} from "@/types/catalogue-voucher";
import {
  readSelectedCatalogueVoucherId,
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

export type CatalogueVoucherPreview = {
  id: string;
  code: string;
  headline: string;
  amount: number;
};

export function useEligibleCatalogueVoucher(
  draft: CatalogueVoucherCartDraft,
  orderType: CatalogueOrderType = "preorder",
  options?: { enabled?: boolean },
): CatalogueVoucherPreview | null {
  const [vouchers, setVouchers] = useState<CatalogueVoucherRecord[]>([]);
  const enabled = options?.enabled !== false;

  useEffect(() => {
    if (!enabled) return;
    void listPublicCatalogueVouchersAction().then(setVouchers);
  }, [enabled]);

  const today = singaporeDateFromIso(new Date().toISOString());
  const selected = useMemo(
    () => selectDraftCatalogueVoucher(vouchers, draft, today, orderType),
    [draft, orderType, today, vouchers],
  );

  useEffect(() => {
    const next = selected?.voucher.id ?? null;
    if (readSelectedCatalogueVoucherId() !== next) {
      writeSelectedCatalogueVoucherId(next);
    }
  }, [selected?.voucher.id]);

  if (!selected || selected.result.amount == null) return null;
  return {
    id: selected.voucher.id,
    code: selected.voucher.code,
    headline: formatCatalogueVoucherHeadline(selected.voucher),
    amount: selected.result.amount,
  };
}
