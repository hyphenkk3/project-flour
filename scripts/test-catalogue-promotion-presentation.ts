/**
 * Catalogue promotion presentation — discovery only.
 * Run: npx tsx scripts/test-catalogue-promotion-presentation.ts
 */
import assert from "node:assert/strict";
import { emptyCatalogueRules } from "@/engines/vouchers/catalogue-voucher";
import {
  buildTargetedPromotionBadgeByCakeId,
  cakeHasNewMerchandisingTag,
  cataloguePromotionGroup,
  cataloguePromotionSizeState,
  catalogueVoucherTargetsCake,
  compareCataloguePromotionPresentationOrder,
  formatCataloguePromotionBadge,
  formatCataloguePromotionDetail,
  formatCataloguePromotionSizeList,
  isCatalogueVoucherCakeTargeted,
  listCataloguePromotionOfferCakes,
  selectPublicCakePromotion,
  sortCakesForCataloguePromotionPresentation,
} from "@/engines/vouchers/catalogue-promotion-presentation";
import type {
  CatalogueVoucherRecord,
  CatalogueVoucherRules,
} from "@/types/catalogue-voucher";

function voucher(
  overrides: Partial<CatalogueVoucherRecord> & {
    rules?: Partial<CatalogueVoucherRules>;
  } = {},
): CatalogueVoucherRecord {
  const { rules, ...rest } = overrides;
  return {
    id: "voucher-1",
    code: "OCT265",
    voucherType: "fixed_amount",
    value: 10,
    validFrom: "2026-09-01",
    validUntil: "2026-10-31",
    status: "active",
    imageUrl: null,
    assetId: null,
    rules: { ...emptyCatalogueRules(), ...rules },
    ...rest,
  };
}

const today = "2026-09-26";
const strawberry = "strawberry";
const mango = "mango";
const earlGrey = "earl-grey";

const targetedSix = voucher({
  rules: {
    cakeIds: [strawberry],
    cakeNames: ["Strawberry"],
    sizeLabels: ['6"'],
    fulfilmentDate: { from: "2026-10-01", until: "2026-10-31" },
    orderDate: { from: null, until: "2026-09-30" },
    orderTypes: ["preorder"],
  },
});

const targetedSixEight = voucher({
  id: "voucher-2",
  code: "OCT5",
  value: 5,
  rules: {
    cakeIds: [strawberry, earlGrey],
    cakeNames: ["Strawberry", "Earl Grey Pistachio"],
    sizeLabels: ['6"', '8"'],
    orderTypes: ["preorder"],
    fulfilmentDate: { from: "2026-10-01", until: "2026-10-31" },
  },
});

const generic = voucher({
  id: "voucher-all",
  code: "STORE5",
  value: 5,
  rules: { cakeIds: [], cakeNames: [], orderTypes: ["preorder"] },
});

const expired = voucher({
  id: "expired",
  validFrom: "2026-01-01",
  validUntil: "2026-08-01",
  rules: { cakeIds: [strawberry], cakeNames: ["Strawberry"] },
});

const future = voucher({
  id: "future",
  validFrom: "2026-11-01",
  validUntil: "2026-11-30",
  rules: { cakeIds: [strawberry], cakeNames: ["Strawberry"] },
});

const freshPickOnly = voucher({
  id: "fp",
  rules: {
    cakeIds: [strawberry],
    cakeNames: ["Strawberry"],
    orderTypes: ["fresh_pick"],
  },
});

const withMinimum = voucher({
  id: "min",
  value: 5,
  rules: {
    cakeIds: [strawberry],
    cakeNames: ["Strawberry"],
    sizeLabels: ['6"'],
    minimumCakeSubtotal: 135,
    orderTypes: ["preorder"],
  },
});

assert.equal(isCatalogueVoucherCakeTargeted(targetedSix), true);
assert.equal(isCatalogueVoucherCakeTargeted(generic), false);
assert.equal(catalogueVoucherTargetsCake(targetedSix, strawberry), true);
assert.equal(catalogueVoucherTargetsCake(generic, strawberry), false);

assert.equal(cataloguePromotionGroup({ isNew: true, isTargetedPromotion: true }), "new");
assert.equal(cataloguePromotionGroup({ isNew: false, isTargetedPromotion: true }), "promotion");
assert.equal(cataloguePromotionGroup({ isNew: false, isTargetedPromotion: false }), "regular");

assert.equal(
  compareCataloguePromotionPresentationOrder(
    { group: "new", manualOrder: 20, id: "new" },
    { group: "promotion", manualOrder: 1, id: "promo" },
  ) < 0,
  true,
);

const ordered = sortCakesForCataloguePromotionPresentation(
  [
    { id: "matcha", name: "Matcha" },
    { id: "chocolate", name: "Chocolate" },
    { id: strawberry, name: "Strawberry" },
    { id: earlGrey, name: "Earl Grey Pistachio" },
    { id: "new-cake", name: "New Cake" },
  ],
  {
    isNew: (cake) => cake.id === "new-cake",
    isTargetedPromotion: (cake) =>
      cake.id === strawberry || cake.id === earlGrey,
    manualOrder: (cake) =>
      ({
        matcha: 1,
        chocolate: 2,
        [strawberry]: 7,
        [earlGrey]: 4,
        "new-cake": 20,
      })[cake.id] ?? null,
  },
);
assert.deepEqual(
  ordered.map((cake) => cake.id),
  ["new-cake", earlGrey, strawberry, "matcha", "chocolate"],
);

assert.equal(
  selectPublicCakePromotion([generic, targetedSix], {
    cakeId: strawberry,
    today,
    orderType: "preorder",
    targetedOnly: true,
  })?.id,
  targetedSix.id,
);
assert.equal(
  selectPublicCakePromotion([generic], {
    cakeId: strawberry,
    today,
    orderType: "preorder",
    targetedOnly: true,
  }),
  null,
);
assert.equal(
  selectPublicCakePromotion([expired], {
    cakeId: strawberry,
    today,
    orderType: "preorder",
    targetedOnly: true,
  }),
  null,
);
assert.equal(
  selectPublicCakePromotion([future], {
    cakeId: strawberry,
    today,
    orderType: "preorder",
    targetedOnly: true,
  }),
  null,
);
assert.equal(
  selectPublicCakePromotion([freshPickOnly], {
    cakeId: strawberry,
    today,
    orderType: "preorder",
    targetedOnly: true,
  }),
  null,
);

const badges = buildTargetedPromotionBadgeByCakeId(
  [generic, targetedSix, targetedSixEight, expired, future, freshPickOnly],
  today,
  "preorder",
);
assert.equal(badges.has(mango), false);
assert.match(badges.get(strawberry)?.detail ?? "", /RM10 OFF/);
assert.match(badges.get(strawberry)?.detail ?? "", /6"/);
assert.doesNotMatch(badges.get(strawberry)?.detail ?? "", /^RM10 OFF$/);
assert.match(badges.get(earlGrey)?.detail ?? "", /6" & 8"/);
assert.match(formatCataloguePromotionBadge(targetedSix, today).eyebrow, /OCTOBER/);

assert.equal(formatCataloguePromotionSizeList(['8"', '6"']), '6" & 8"');
assert.equal(cataloguePromotionSizeState(['6"', '8"'], '4"'), "not_eligible");
assert.equal(cataloguePromotionSizeState(['6"', '8"'], '6"'), "qualifies");
assert.equal(cataloguePromotionSizeState(['6"', '8"'], '8"'), "qualifies");
assert.equal(cataloguePromotionSizeState([], '4"'), "unrestricted");

const fourInch = formatCataloguePromotionDetail(targetedSixEight, {
  today,
  selectedSizeLabel: '4"',
  orderType: "preorder",
});
assert.match(fourInch.sizeNote ?? "", /4" size is not eligible/);
assert.match(fourInch.sizeLine ?? "", /6" & 8"/);
assert.doesNotMatch(fourInch.sizeNote ?? "", /Available for this cake/);

const sixInch = formatCataloguePromotionDetail(targetedSixEight, {
  today,
  selectedSizeLabel: '6"',
  orderType: "preorder",
});
assert.equal(sixInch.sizeNote, "This size qualifies");

const eightInch = formatCataloguePromotionDetail(targetedSixEight, {
  today,
  selectedSizeLabel: '8"',
  orderType: "preorder",
});
assert.equal(eightInch.sizeNote, "This size qualifies");

const unrestricted = formatCataloguePromotionDetail(generic, {
  today,
  selectedSizeLabel: '4"',
  orderType: "preorder",
});
assert.equal(unrestricted.sizeLine, null);
assert.equal(unrestricted.sizeNote, null);

const minBadge = formatCataloguePromotionBadge(withMinimum, today);
assert.match(minBadge.detail, /min\. RM135/);

const offerCakes = listCataloguePromotionOfferCakes(targetedSixEight);
assert.equal(offerCakes?.length, 2);
assert.equal(offerCakes?.[0]?.name, "Strawberry");
assert.equal(listCataloguePromotionOfferCakes(generic), null);

assert.equal(
  cakeHasNewMerchandisingTag({
    tags: [{ name: "New!", isActive: true }],
  }),
  true,
);
assert.equal(
  cakeHasNewMerchandisingTag({
    tags: [{ name: "Limited", isActive: true }],
  }),
  false,
);

console.log("PASS catalogue promotion presentation");
