import {
  isCatalogueVoucherDiscoverable,
} from "@/engines/vouchers/catalogue-voucher";
import { singaporeDateFromIso } from "@/engines/orders/promotions";
import { CakeOfferHintView } from "@/workspaces/storefront/offers/CakeOfferHintView";
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
  return <CakeOfferHintView vouchers={vouchers} />;
}
