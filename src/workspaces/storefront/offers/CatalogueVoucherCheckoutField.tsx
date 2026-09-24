"use client";

import { useSyncExternalStore } from "react";
import {
  readSelectedCatalogueVoucherId,
  subscribeCatalogueVoucherSelection,
} from "@/workspaces/storefront/offers/catalogue-voucher-selection";

export function CatalogueVoucherCheckoutField() {
  const voucherId = useSyncExternalStore(
    subscribeCatalogueVoucherSelection,
    readSelectedCatalogueVoucherId,
    () => null,
  );
  if (!voucherId) return null;
  return <input name="catalogue_voucher_id" type="hidden" value={voucherId} />;
}
