"use client";

import type { CatalogueOrderType } from "@/types/catalogue-voucher";
import {
  useEligibleCatalogueVoucher,
  type CatalogueVoucherCartDraft,
} from "@/workspaces/storefront/offers/useEligibleCatalogueVoucher";

export function CatalogueVoucherCheckoutField({
  draft,
  orderType = "preorder",
}: {
  draft: CatalogueVoucherCartDraft;
  orderType?: CatalogueOrderType;
}) {
  const voucher = useEligibleCatalogueVoucher(draft, orderType);
  return (
    <input name="catalogue_voucher_id" type="hidden" value={voucher?.id ?? ""} />
  );
}
