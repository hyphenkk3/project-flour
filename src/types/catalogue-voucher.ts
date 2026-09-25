import type { LibraryVoucherStatus, LibraryVoucherType } from "@/types/library-voucher";

export const CATALOGUE_VOUCHER_ADJUSTMENT_CODE = "catalogue_voucher";

export const CATALOGUE_VOUCHER_RULE_TYPES = [
  "order_date",
  "fulfilment_date",
  "minimum_cake_subtotal",
  "cake_size",
  "cake",
  "order_type",
] as const;

export const CATALOGUE_ORDER_TYPES = ["preorder", "fresh_pick"] as const;

export type CatalogueOrderType = (typeof CATALOGUE_ORDER_TYPES)[number];

export type CatalogueVoucherRuleType =
  (typeof CATALOGUE_VOUCHER_RULE_TYPES)[number];

export type CatalogueDateBounds = {
  from: string | null;
  until: string | null;
};

export type CatalogueVoucherRules = {
  orderDate: CatalogueDateBounds | null;
  fulfilmentDate: CatalogueDateBounds | null;
  minimumCakeSubtotal: number | null;
  cakeIds: string[];
  sizeLabels: string[];
  cakeNames: string[];
  orderTypes: CatalogueOrderType[];
};

export type CatalogueVoucherRecord = {
  id: string;
  code: string;
  voucherType: LibraryVoucherType;
  value: number;
  validFrom: string | null;
  validUntil: string | null;
  status: LibraryVoucherStatus;
  imageUrl: string | null;
  assetId: string | null;
  rules: CatalogueVoucherRules;
};

export type CatalogueOrderItem = {
  cakeId: string;
  cakeSizeId: string;
  sizeLabel: string;
  quantity: number;
  unitPrice: number;
};

export type CatalogueEligibilityInput = {
  orderDate: string;
  fulfilmentDate: string;
  items: CatalogueOrderItem[];
  today: string;
  hasAugustPromo: boolean;
  hasRm10Card: boolean;
  hasCatalogueVoucher: boolean;
  /** Authoritative order class. Fresh Picks = orders.extra_stock_id is set. */
  orderType: CatalogueOrderType;
};

export type CatalogueConditionResult = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type CatalogueEligibilityResult = {
  eligible: boolean;
  applicable: boolean;
  discoverable: boolean;
  amount: number | null;
  failedConditions: CatalogueConditionResult[];
  passedConditions: CatalogueConditionResult[];
  qualifyingItemIndexes: number[];
  reason: string | null;
};
