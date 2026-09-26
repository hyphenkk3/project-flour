import {
  catalogueVoucherAllowsOrderType,
  isCatalogueVoucherDiscoverable,
} from "@/engines/vouchers/catalogue-voucher";
import { selectPublicCakePromotion } from "@/engines/vouchers/catalogue-promotion-presentation";
import { singaporeDateFromIso } from "@/engines/orders/promotions";
import { listPublicCatalogueVouchers } from "@/workspaces/vouchers/catalogue-queries";
import type { CatalogueVoucherRecord } from "@/types/catalogue-voucher";

export async function loadCakeOfferVoucher(
  cakeId: string,
): Promise<{ voucher: CatalogueVoucherRecord; today: string } | null> {
  try {
    const today = singaporeDateFromIso(new Date().toISOString());
    const vouchers = await listPublicCatalogueVouchers();
    const voucher = selectPublicCakePromotion(vouchers, {
      cakeId,
      today,
      orderType: "preorder",
    });
    if (!voucher) return null;
    if (!isCatalogueVoucherDiscoverable(voucher, today)) return null;
    if (!catalogueVoucherAllowsOrderType(voucher.rules, "preorder")) return null;
    return { voucher, today };
  } catch {
    return null;
  }
}
