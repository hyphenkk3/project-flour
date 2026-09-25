import {
  catalogueOrderTypeFromExtraStockId,
  emptyCatalogueRules,
  evaluateCatalogueVoucherEligibility,
  evaluateCatalogueVouchers,
  selectEligibleCatalogueVoucher,
} from "@/engines/vouchers/catalogue-voucher";
import type { CatalogueOrderType } from "@/types/catalogue-voucher";
import {
  AUGUST_PROMO_CODE,
  hasActiveAdjustmentCode,
  RM10_CARD_CODE,
  singaporeDateFromIso,
} from "@/engines/orders/promotions";
import { CATALOGUE_VOUCHER_ADJUSTMENT_CODE } from "@/types/catalogue-voucher";
import type {
  CatalogueEligibilityInput,
  CatalogueOrderItem,
  CatalogueVoucherRecord,
  CatalogueVoucherRules,
} from "@/types/catalogue-voucher";
import type { LibraryVoucher } from "@/types/library-voucher";
import type { StorefrontOrderItem } from "@/types/storefront";

export function toCatalogueVoucherRecord(
  voucher: LibraryVoucher,
): CatalogueVoucherRecord {
  return {
    id: voucher.id,
    code: voucher.code,
    voucherType: voucher.voucherType,
    value: voucher.value,
    validFrom: voucher.validFrom,
    validUntil: voucher.validUntil,
    status: voucher.status,
    imageUrl: voucher.imageUrl,
    assetId: voucher.assetId,
    rules: voucher.rules ?? emptyCatalogueRules(),
  };
}

export function catalogueItemsFromOrderItems(
  items: Array<
    Pick<
      StorefrontOrderItem,
      "cakeId" | "cakeSizeId" | "sizeLabel" | "quantity" | "unitPrice"
    >
  >,
): CatalogueOrderItem[] {
  return items.map((item) => ({
    cakeId: item.cakeId,
    cakeSizeId: item.cakeSizeId ?? "",
    sizeLabel: item.sizeLabel,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));
}

export function catalogueEligibilityInputFromOrder(
  order: {
    createdAt: string;
    pickupDate: string;
    items: Array<
      Pick<
        StorefrontOrderItem,
        "cakeId" | "cakeSizeId" | "sizeLabel" | "quantity" | "unitPrice"
      >
    >;
    adjustments: Array<{
      code: string | null;
      status?: string;
      reversesAdjustmentId?: string | null;
    }>;
    extraStockId?: string | null;
  },
  today: string,
): CatalogueEligibilityInput {
  return {
    orderDate: singaporeDateFromIso(order.createdAt),
    fulfilmentDate: order.pickupDate,
    items: catalogueItemsFromOrderItems(order.items),
    today,
    orderType: catalogueOrderTypeFromExtraStockId(order.extraStockId),
    hasAugustPromo: hasActiveAdjustmentCode(
      order.adjustments,
      AUGUST_PROMO_CODE,
    ),
    hasRm10Card: hasActiveAdjustmentCode(order.adjustments, RM10_CARD_CODE),
    hasCatalogueVoucher: hasActiveAdjustmentCode(
      order.adjustments,
      CATALOGUE_VOUCHER_ADJUSTMENT_CODE,
    ),
  };
}

export function catalogueEligibilityInputFromDraft(
  draft: {
    pickupDate: string;
    items: Array<{
      cakeId: string;
      sizeId: string;
      sizeLabel: string;
      quantity: number;
      unitPrice: number;
    }>;
  },
  today: string,
  stacking?: {
    hasAugustPromo?: boolean;
    hasRm10Card?: boolean;
    hasCatalogueVoucher?: boolean;
    orderType?: CatalogueOrderType;
  },
): CatalogueEligibilityInput {
  return {
    orderDate: today,
    fulfilmentDate: draft.pickupDate,
    items: draft.items.map((item) => ({
      cakeId: item.cakeId,
      cakeSizeId: item.sizeId,
      sizeLabel: item.sizeLabel,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    today,
    hasAugustPromo: stacking?.hasAugustPromo === true,
    hasRm10Card: stacking?.hasRm10Card === true,
    hasCatalogueVoucher: stacking?.hasCatalogueVoucher === true,
    orderType: stacking?.orderType ?? "preorder",
  };
}

export function evaluateOrderCatalogueVouchers(
  vouchers: CatalogueVoucherRecord[],
  order: {
    createdAt: string;
    pickupDate: string;
    items: Array<
      Pick<
        StorefrontOrderItem,
        "cakeId" | "cakeSizeId" | "sizeLabel" | "quantity" | "unitPrice"
      >
    >;
    adjustments: Array<{
      code: string | null;
      status?: string;
      reversesAdjustmentId?: string | null;
    }>;
    extraStockId?: string | null;
  },
  today: string,
) {
  return evaluateCatalogueVouchers(
    vouchers,
    catalogueEligibilityInputFromOrder(order, today),
  );
}

export function evaluateDraftCatalogueVouchers(
  vouchers: CatalogueVoucherRecord[],
  draft: {
    pickupDate: string;
    items: Array<{
      cakeId: string;
      sizeId: string;
      sizeLabel: string;
      quantity: number;
      unitPrice: number;
    }>;
  },
  today: string,
  orderType: CatalogueOrderType = "preorder",
) {
  return evaluateCatalogueVouchers(
    vouchers,
    catalogueEligibilityInputFromDraft(draft, today, { orderType }),
  );
}

export function selectDraftCatalogueVoucher(
  vouchers: CatalogueVoucherRecord[],
  draft: {
    pickupDate: string;
    items: Array<{
      cakeId: string;
      sizeId: string;
      sizeLabel: string;
      quantity: number;
      unitPrice: number;
    }>;
  },
  today: string,
  orderType: CatalogueOrderType = "preorder",
) {
  return selectEligibleCatalogueVoucher(
    evaluateDraftCatalogueVouchers(vouchers, draft, today, orderType),
  );
}

export function evaluateOneCatalogueVoucher(
  voucher: CatalogueVoucherRecord,
  input: CatalogueEligibilityInput,
) {
  return evaluateCatalogueVoucherEligibility(voucher, input);
}

export function withDisplayCakeNames(
  rules: CatalogueVoucherRules,
  cakes: Array<{ id: string; name: string }>,
): CatalogueVoucherRules {
  const names = rules.cakeIds
    .map((id) => cakes.find((cake) => cake.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  return { ...rules, cakeNames: names };
}
