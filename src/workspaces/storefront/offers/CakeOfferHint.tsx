import {
  cataloguePromotionPeriodFromWindow,
  catalogueVoucherAllowsOrderType,
  isCatalogueVoucherDiscoverable,
} from "@/engines/vouchers/catalogue-voucher";
import { selectPublicCakePromotion } from "@/engines/vouchers/catalogue-promotion-presentation";
import { singaporeDateFromIso } from "@/engines/orders/promotions";
import { listPublicCatalogueVouchers } from "@/workspaces/vouchers/catalogue-queries";
import type { CatalogueVoucherRecord } from "@/types/catalogue-voucher";

export type CakeOfferVoucher = {
  voucher: CatalogueVoucherRecord;
  today: string;
};

export async function loadCakeOfferVoucher(
  cakeId: string,
  window?: { fulfilmentFrom?: string | null; fulfilmentTo?: string | null },
): Promise<CakeOfferVoucher | null> {
  try {
    const today = singaporeDateFromIso(new Date().toISOString());
    const from = window?.fulfilmentFrom?.trim().slice(0, 10) ?? "";
    const to = window?.fulfilmentTo?.trim().slice(0, 10) ?? "";
    const period =
      /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)
        ? cataloguePromotionPeriodFromWindow({
            today,
            fulfilmentFrom: from,
            fulfilmentTo: to,
          })
        : null;
    const vouchers = await listPublicCatalogueVouchers();
    const voucher = selectPublicCakePromotion(vouchers, {
      cakeId,
      today,
      orderType: "preorder",
      period,
    });
    if (!voucher) return null;
    if (!isCatalogueVoucherDiscoverable(voucher, today)) return null;
    if (!catalogueVoucherAllowsOrderType(voucher.rules, "preorder")) return null;
    return { voucher, today };
  } catch {
    return null;
  }
}
