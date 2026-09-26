/**
 * Customer discovery/presentation for catalogue vouchers.
 * Does not calculate discounts, apply vouchers, or replace eligibility.
 */
import { compareCakeSizeLabels } from "@/engines/menu/cake-size-order";
import {
  catalogueVoucherAllowsOrderType,
  catalogueVoucherAppliesToPromotionPeriod,
  catalogueVoucherPromotesInCollectionPeriod,
  compareCatalogueVoucherSpecificity,
  formatCatalogueVoucherHeadline,
  isCatalogueVoucherDiscoverable,
  normalizeCatalogueSizeLabel,
  selectCatalogueVoucherBySpecificity,
  summarizeCatalogueOrderTypes,
  type CataloguePromotionPeriod,
} from "@/engines/vouchers/catalogue-voucher";
import {
  formatBusinessCalendarDate,
  formatBusinessMonthYear,
} from "@/lib/dates";
import type { CatalogueOrderType, CatalogueVoucherRecord } from "@/types/catalogue-voucher";

export type CataloguePromotionGroup = "new" | "promotion" | "regular";

export type CataloguePromotionBadge = {
  voucherId: string;
  eyebrow: string;
  detail: string;
};

export type CataloguePromotionSizeState =
  | "unrestricted"
  | "qualifies"
  | "not_eligible";

export type CataloguePromotionDetail = {
  voucherId: string;
  code: string;
  eyebrow: string;
  headline: string;
  sizeLine: string | null;
  sizeState: CataloguePromotionSizeState;
  sizeNote: string | null;
  orderBy: string | null;
  fulfilment: string | null;
  minimum: string | null;
  orderType: string | null;
  autoApplyNote: string;
};

export type CataloguePromotionOfferCake = {
  cakeId: string;
  name: string;
  href: string;
  sizeDetail: string;
};

const NEW_TAG = "new!";
const AUTO_APPLY_NOTE = "Automatically applied at checkout when eligible";

export function isCatalogueVoucherCakeTargeted(
  voucher: Pick<CatalogueVoucherRecord, "rules">,
): boolean {
  return voucher.rules.cakeIds.length > 0;
}

export function catalogueVoucherTargetsCake(
  voucher: Pick<CatalogueVoucherRecord, "rules">,
  cakeId: string,
): boolean {
  return (
    isCatalogueVoucherCakeTargeted(voucher) &&
    voucher.rules.cakeIds.includes(cakeId)
  );
}

export function cakeHasNewMerchandisingTag(cake: {
  tags?: ReadonlyArray<{ name: string; isActive?: boolean }> | null;
}): boolean {
  return (cake.tags ?? []).some(
    (tag) =>
      tag.isActive !== false &&
      tag.name.trim().toLowerCase() === NEW_TAG,
  );
}

export function listDiscoverableCatalogueVouchers(
  vouchers: readonly CatalogueVoucherRecord[],
  today: string,
): CatalogueVoucherRecord[] {
  return vouchers.filter((voucher) =>
    isCatalogueVoucherDiscoverable(voucher, today),
  );
}

export function selectPublicCakePromotion(
  vouchers: readonly CatalogueVoucherRecord[],
  input: {
    cakeId: string;
    today: string;
    orderType: CatalogueOrderType;
    targetedOnly?: boolean;
    period?: CataloguePromotionPeriod | null;
  },
): CatalogueVoucherRecord | null {
  const candidates = listDiscoverableCatalogueVouchers(vouchers, input.today).filter(
    (voucher) => {
      if (!catalogueVoucherAllowsOrderType(voucher.rules, input.orderType)) {
        return false;
      }
      if (
        input.period &&
        !catalogueVoucherAppliesToPromotionPeriod(voucher, input.period)
      ) {
        return false;
      }
      if (input.targetedOnly) {
        return catalogueVoucherTargetsCake(voucher, input.cakeId);
      }
      return (
        voucher.rules.cakeIds.length === 0 ||
        voucher.rules.cakeIds.includes(input.cakeId)
      );
    },
  );
  return selectCatalogueVoucherBySpecificity(candidates);
}

export function cataloguePromotionGroup(input: {
  isNew: boolean;
  isTargetedPromotion: boolean;
}): CataloguePromotionGroup {
  if (input.isNew) return "new";
  if (input.isTargetedPromotion) return "promotion";
  return "regular";
}

const GROUP_RANK: Record<CataloguePromotionGroup, number> = {
  new: 0,
  promotion: 1,
  regular: 2,
};

export function compareCataloguePromotionPresentationOrder(
  left: {
    group: CataloguePromotionGroup;
    manualOrder: number | null;
    id: string;
  },
  right: {
    group: CataloguePromotionGroup;
    manualOrder: number | null;
    id: string;
  },
): number {
  const group = GROUP_RANK[left.group] - GROUP_RANK[right.group];
  if (group !== 0) return group;
  const leftOrder = left.manualOrder ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.manualOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return left.id.localeCompare(right.id);
}

export function sortCakesForCataloguePromotionPresentation<
  T extends { id: string },
>(
  cakes: readonly T[],
  input: {
    isNew: (cake: T) => boolean;
    isTargetedPromotion: (cake: T) => boolean;
    manualOrder: (cake: T, index: number) => number | null;
  },
): T[] {
  return cakes
    .map((cake, index) => ({
      cake,
      group: cataloguePromotionGroup({
        isNew: input.isNew(cake),
        isTargetedPromotion: input.isTargetedPromotion(cake),
      }),
      manualOrder: input.manualOrder(cake, index),
    }))
    .sort((left, right) =>
      compareCataloguePromotionPresentationOrder(
        { group: left.group, manualOrder: left.manualOrder, id: left.cake.id },
        { group: right.group, manualOrder: right.manualOrder, id: right.cake.id },
      ),
    )
    .map((row) => row.cake);
}

export function formatCataloguePromotionSizeList(
  sizeLabels: readonly string[],
): string | null {
  const labels = [...sizeLabels]
    .map((label) => label.trim())
    .filter(Boolean)
    .sort(compareCakeSizeLabels);
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0] ?? null;
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}`;
}

export function cataloguePromotionSizeState(
  sizeLabels: readonly string[],
  selectedSizeLabel: string | null | undefined,
): CataloguePromotionSizeState {
  if (sizeLabels.length === 0) return "unrestricted";
  const selected = selectedSizeLabel?.trim() ?? "";
  if (!selected) return "unrestricted";
  const needle = normalizeCatalogueSizeLabel(selected);
  const matches = sizeLabels.some(
    (label) => normalizeCatalogueSizeLabel(label) === needle,
  );
  return matches ? "qualifies" : "not_eligible";
}

function promotionMonthSource(voucher: CatalogueVoucherRecord): string | null {
  const source =
    voucher.rules.fulfilmentDate?.from ??
    voucher.rules.fulfilmentDate?.until ??
    voucher.rules.orderDate?.from ??
    voucher.rules.orderDate?.until ??
    voucher.validFrom ??
    voucher.validUntil ??
    null;
  const key = source?.slice(0, 10) ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

export function formatCataloguePromotionMonthEyebrow(
  voucher: CatalogueVoucherRecord,
  _today: string,
  suffix = "OFFER",
): string {
  const source = promotionMonthSource(voucher);
  if (!source) return suffix;
  const monthYear = formatBusinessMonthYear(source);
  const month = monthYear.split(" ")[0]?.toUpperCase() ?? "";
  if (!month || month === source.toUpperCase()) {
    return suffix;
  }
  return `${month} ${suffix}`;
}

export function formatCataloguePromotionBadge(
  voucher: CatalogueVoucherRecord,
  today: string,
): CataloguePromotionBadge {
  const headline = formatCatalogueVoucherHeadline(voucher);
  const sizes = formatCataloguePromotionSizeList(voucher.rules.sizeLabels);
  const minimum =
    voucher.rules.minimumCakeSubtotal != null
      ? `min. RM${voucher.rules.minimumCakeSubtotal}`
      : null;
  const parts = [headline, sizes, minimum].filter(Boolean);
  return {
    voucherId: voucher.id,
    eyebrow: formatCataloguePromotionMonthEyebrow(voucher, today),
    detail: parts.join(" · "),
  };
}

export function formatCataloguePromotionDateBounds(
  bounds: { from: string | null; until: string | null } | null,
  kind: "order" | "fulfilment",
): string | null {
  if (!bounds || (!bounds.from && !bounds.until)) return null;
  const from = bounds.from ? formatBusinessCalendarDate(bounds.from) : null;
  const until = bounds.until ? formatBusinessCalendarDate(bounds.until) : null;
  if (kind === "order") {
    if (until) return until;
    return from ? `From ${from}` : null;
  }
  if (from && until) {
    const fromParts = /^(\d{1,2}) (.+)$/.exec(from);
    const untilParts = /^(\d{1,2}) (.+)$/.exec(until);
    if (
      fromParts &&
      untilParts &&
      fromParts[2] === untilParts[2]
    ) {
      return `${fromParts[1]}–${untilParts[1]} ${untilParts[2]}`;
    }
    return `${from}–${until}`;
  }
  return until ?? from;
}

export function formatCataloguePromotionDetail(
  voucher: CatalogueVoucherRecord,
  input: {
    today: string;
    selectedSizeLabel?: string | null;
    orderType: CatalogueOrderType;
  },
): CataloguePromotionDetail {
  const sizeList = formatCataloguePromotionSizeList(voucher.rules.sizeLabels);
  const sizeState = cataloguePromotionSizeState(
    voucher.rules.sizeLabels,
    input.selectedSizeLabel,
  );
  const selected = input.selectedSizeLabel?.trim() ?? "";
  let sizeNote: string | null = null;
  if (sizeState === "qualifies") {
    sizeNote = "This size qualifies";
  } else if (sizeState === "not_eligible" && selected) {
    sizeNote = `${selected} size is not eligible for this offer.`;
  }

  const preorderOnly =
    voucher.rules.orderTypes.length === 1 &&
    voucher.rules.orderTypes[0] === "preorder";
  const eyebrow = formatCataloguePromotionMonthEyebrow(
    voucher,
    input.today,
    preorderOnly ? "PRE-ORDER OFFER" : "OFFER",
  );

  const orderType =
    summarizeCatalogueOrderTypes(voucher.rules.orderTypes) === "Pre-order only"
      ? "Pre-order"
      : summarizeCatalogueOrderTypes(voucher.rules.orderTypes);

  return {
    voucherId: voucher.id,
    code: voucher.code,
    eyebrow,
    headline: formatCatalogueVoucherHeadline(voucher),
    sizeLine: sizeList
      ? voucher.rules.sizeLabels.length === 1
        ? `Valid on ${sizeList} size`
        : `Valid on ${sizeList} sizes`
      : null,
    sizeState,
    sizeNote,
    orderBy: formatCataloguePromotionDateBounds(voucher.rules.orderDate, "order"),
    fulfilment: formatCataloguePromotionDateBounds(
      voucher.rules.fulfilmentDate,
      "fulfilment",
    ),
    minimum:
      voucher.rules.minimumCakeSubtotal != null
        ? `RM${voucher.rules.minimumCakeSubtotal} cake subtotal`
        : null,
    orderType,
    autoApplyNote: AUTO_APPLY_NOTE,
  };
}

export function listCataloguePromotionOfferCakes(
  voucher: CatalogueVoucherRecord,
): CataloguePromotionOfferCake[] | null {
  if (!isCatalogueVoucherCakeTargeted(voucher)) return null;
  const names = voucher.rules.cakeNames;
  return voucher.rules.cakeIds.map((cakeId, index) => ({
    cakeId,
    name: names[index]?.trim() || "Selected cake",
    href: `/cakes/${cakeId}`,
    sizeDetail: formatCataloguePromotionBadge(voucher, "").detail,
  }));
}

export function buildTargetedPromotionBadgeByCakeId(
  vouchers: readonly CatalogueVoucherRecord[],
  today: string,
  orderType: CatalogueOrderType,
  period?: CataloguePromotionPeriod | null,
  options?: { collectionMerchandising?: boolean },
): Map<string, CataloguePromotionBadge> {
  const badges = new Map<string, CataloguePromotionBadge>();
  const ranked = listDiscoverableCatalogueVouchers(vouchers, today)
    .filter((voucher) => {
      if (!catalogueVoucherAllowsOrderType(voucher.rules, orderType)) {
        return false;
      }
      if (!isCatalogueVoucherCakeTargeted(voucher)) return false;
      if (!period) return true;
      return options?.collectionMerchandising
        ? catalogueVoucherPromotesInCollectionPeriod(voucher, period)
        : catalogueVoucherAppliesToPromotionPeriod(voucher, period);
    })
    .sort(compareCatalogueVoucherSpecificity);
  for (const voucher of ranked) {
    const badge = formatCataloguePromotionBadge(voucher, today);
    for (const cakeId of voucher.rules.cakeIds) {
      if (!badges.has(cakeId)) badges.set(cakeId, badge);
    }
  }
  return badges;
}
