/**
 * Customer Fresh Picks: one card per cake offering, not Extra-unit inventory.
 * Run: npx tsx scripts/test-customer-fresh-picks-offerings.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FRESH_PICKS_HELD_LABEL,
  freshPickAvailabilityDateLabel,
  freshPickAvailabilityLabel,
  freshPickCustomerStatusLabel,
  freshPickOfferingKey,
  groupCustomerFreshPickOfferings,
  isCustomerOrderableFreshPick,
  isPublishedFreshPick,
  selectCustomerFreshPickOfferings,
  unionFreshPickAvailabilityDays,
  type FreshPickDay,
  type FreshPickOfferingIdentity,
} from "@/engines/extra/customer-fresh-picks";
import {
  freshPickCatalogueCtaState,
  parseFreshPickCart,
} from "@/workspaces/storefront/extra/fresh-pick-cart";

function pick(
  overrides: Partial<FreshPickOfferingIdentity> & Pick<FreshPickOfferingIdentity, "id">,
): FreshPickOfferingIdentity {
  return {
    cakeName: "Chocolate D'Amour",
    sizeLabel: "6\"",
    libraryCakeId: "cake-amour",
    libraryCakeSizeId: "size-6",
    pickupAvailableFromAt: "2026-08-17T04:00:00.000Z",
    confirmedAt: "2026-08-17T03:00:00.000Z",
    ...overrides,
  };
}

{
  const a = pick({ id: "extra-a", confirmedAt: "2026-08-17T03:10:00.000Z" });
  const b = pick({ id: "extra-b", confirmedAt: "2026-08-17T03:00:00.000Z" });
  assert.equal(freshPickOfferingKey(a), freshPickOfferingKey(b));
  const cards = selectCustomerFreshPickOfferings([a, b]);
  assert.equal(cards.length, 1, "identical extras collapse to one customer card");
  assert.equal(cards[0]?.id, "extra-b", "earliest posted Extra is the Order target");
}

{
  const laterPickup = pick({
    id: "extra-later",
    pickupAvailableFromAt: "2026-08-18T04:00:00.000Z",
    confirmedAt: "2026-08-17T01:00:00.000Z",
  });
  const soonerPickup = pick({
    id: "extra-sooner",
    pickupAvailableFromAt: "2026-08-17T04:00:00.000Z",
    confirmedAt: "2026-08-17T02:00:00.000Z",
  });
  const cards = selectCustomerFreshPickOfferings([laterPickup, soonerPickup]);
  assert.equal(cards.length, 1);
  assert.equal(
    cards[0]?.id,
    "extra-sooner",
    "sooner pickup-from wins over earlier confirmed_at",
  );
}

{
  const remaining = pick({ id: "extra-remaining" });
  const cards = selectCustomerFreshPickOfferings([remaining]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.id, "extra-remaining");
}

{
  const cards = selectCustomerFreshPickOfferings([]);
  assert.equal(cards.length, 0, "no remaining units → no customer card");
}

{
  const amour = pick({ id: "extra-amour" });
  const pandan = pick({
    id: "extra-pandan",
    cakeName: "Pandan Mango",
    libraryCakeId: "cake-pandan",
    libraryCakeSizeId: "size-pandan-6",
  });
  const cards = selectCustomerFreshPickOfferings([amour, pandan]);
  assert.equal(cards.length, 2, "different cakes remain separate cards");
  assert.deepEqual(
    cards.map((card) => card.id).sort(),
    ["extra-amour", "extra-pandan"],
  );
}

{
  const six = pick({ id: "extra-6" });
  const eight = pick({
    id: "extra-8",
    sizeLabel: "8\"",
    libraryCakeSizeId: "size-8",
  });
  const cards = selectCustomerFreshPickOfferings([six, eight]);
  assert.equal(cards.length, 2, "same cake different sizes remain separate cards");
}

{
  const namedA = pick({
    id: "named-a",
    libraryCakeId: null,
    libraryCakeSizeId: null,
  });
  const namedB = pick({
    id: "named-b",
    libraryCakeId: null,
    libraryCakeSizeId: null,
    confirmedAt: "2026-08-17T04:00:00.000Z",
  });
  const cards = selectCustomerFreshPickOfferings([namedB, namedA]);
  assert.equal(cards.length, 1, "name+size fallback still collapses identical extras");
  assert.equal(cards[0]?.id, "named-a");
}

{
  const a = pick({
    id: "lib-a",
    cakeName: "Chocolate D'Amour",
    libraryCakeId: "cake-x",
    libraryCakeSizeId: "size-x",
  });
  const b = pick({
    id: "lib-b",
    cakeName: "Chocolate Damour",
    libraryCakeId: "cake-x",
    libraryCakeSizeId: "size-x",
    confirmedAt: "2026-08-17T04:00:00.000Z",
  });
  assert.equal(freshPickOfferingKey(a), freshPickOfferingKey(b));
  assert.equal(selectCustomerFreshPickOfferings([a, b])[0]?.id, "lib-a");
}

{
  const a = pick({
    id: "diff-lib-a",
    libraryCakeId: "cake-one",
    libraryCakeSizeId: "size-one",
  });
  const b = pick({
    id: "diff-lib-b",
    libraryCakeId: "cake-two",
    libraryCakeSizeId: "size-two",
  });
  assert.notEqual(freshPickOfferingKey(a), freshPickOfferingKey(b));
  assert.equal(selectCustomerFreshPickOfferings([a, b]).length, 2);
}

type GroupPick = FreshPickOfferingIdentity & {
  days: FreshPickDay[];
  unitPrice?: number | null;
};

function groupPick(
  overrides: Partial<GroupPick> & Pick<GroupPick, "id" | "days">,
): GroupPick {
  return {
    cakeName: "Salted Peanut",
    sizeLabel: '6"',
    libraryCakeId: "cake-peanut",
    libraryCakeSizeId: "size-peanut-6",
    unitPrice: 135,
    pickupAvailableFromAt: "2026-09-10T04:00:00.000Z",
    confirmedAt: "2026-09-10T03:00:00.000Z",
    ...overrides,
  };
}

const todayYmd = "2026-09-10";
const unitA = groupPick({
  id: "peanut-a",
  days: ["today"],
  pickupAvailableFromAt: "2026-09-10T04:00:00.000Z",
});
const unitB = groupPick({
  id: "peanut-b",
  days: ["today", "tomorrow"],
  pickupAvailableFromAt: "2026-09-10T04:00:00.000Z",
  confirmedAt: "2026-09-10T04:00:00.000Z",
});

{
  const cards = groupCustomerFreshPickOfferings([unitA, unitB]);
  assert.equal(cards.length, 1, "matching Salted Peanut 6\" collapses to one offering");
  assert.deepEqual(cards[0]?.days, ["today", "tomorrow"]);
  assert.equal(
    freshPickAvailabilityLabel(cards[0]!.days),
    "Available today & tomorrow",
  );
  assert.equal(
    freshPickAvailabilityDateLabel(cards[0]!.days, todayYmd),
    "10–11 SEP",
  );
  assert.equal(cards[0]?.id, "peanut-b", "widest remaining window is the Order target");
  assert.deepEqual(cards[0]?.extraStockIds, ["peanut-b", "peanut-a"]);
}

{
  const cards = groupCustomerFreshPickOfferings([unitA]);
  assert.equal(cards.length, 1, "after selling B, A remains one offering");
  assert.deepEqual(cards[0]?.days, ["today"]);
  assert.equal(freshPickAvailabilityLabel(cards[0]!.days), "Available today");
  assert.equal(
    freshPickAvailabilityDateLabel(cards[0]!.days, todayYmd),
    "10 SEP",
  );
  assert.deepEqual(cards[0]?.extraStockIds, ["peanut-a"]);
}

{
  const cards = groupCustomerFreshPickOfferings([unitB]);
  assert.equal(cards.length, 1, "after selling A, B remains one offering");
  assert.deepEqual(cards[0]?.days, ["today", "tomorrow"]);
  assert.equal(
    freshPickAvailabilityLabel(cards[0]!.days),
    "Available today & tomorrow",
  );
  assert.deepEqual(cards[0]?.extraStockIds, ["peanut-b"]);
}

{
  const cards = groupCustomerFreshPickOfferings([]);
  assert.equal(cards.length, 0, "both sold → no customer-facing offering");
}

{
  const moved = groupPick({
    id: "peanut-b",
    days: ["tomorrow"],
    pickupAvailableFromAt: "2026-09-11T04:00:00.000Z",
  });
  const cards = groupCustomerFreshPickOfferings([moved]);
  assert.equal(cards[0]?.id, "peanut-b", "moved unit keeps extra_stock.id");
  assert.deepEqual(cards[0]?.days, ["tomorrow"]);
  assert.equal(
    freshPickAvailabilityLabel(cards[0]!.days),
    "Available tomorrow",
  );
}

{
  const slicedIgnored = groupCustomerFreshPickOfferings([unitA]);
  assert.deepEqual(slicedIgnored[0]?.extraStockIds, ["peanut-a"]);
  assert.equal(
    slicedIgnored.length,
    1,
    "sliced unit omitted from input no longer contributes",
  );
}

{
  const cards = groupCustomerFreshPickOfferings([unitA, unitB]);
  assert.notEqual(cards[0]?.extraStockIds[0], cards[0]?.extraStockIds[1]);
  const cartWithB = parseFreshPickCart({
    pickupDate: "2026-09-10",
    pickupTime: "14:00",
    items: [
      {
        extraStockId: "peanut-b",
        cakeName: "Salted Peanut",
        sizeLabel: '6"',
        unitPrice: 135,
        pickupDate: "2026-09-10",
        pickupTime: "14:00",
      },
    ],
  });
  const afterOne = freshPickCatalogueCtaState(cards[0]!.extraStockIds, cartWithB);
  assert.equal(afterOne.addedToCart, true, "one grouped unit in cart shows Added to Cart");
  assert.equal(afterOne.extraStockId, "peanut-b");
  assert.equal(afterOne.addAnotherStockId, "peanut-a", "Add another targets remaining exact id");
  const cartWithBoth = parseFreshPickCart({
    pickupDate: "2026-09-10",
    pickupTime: "14:00",
    items: [
      {
        extraStockId: "peanut-b",
        cakeName: "Salted Peanut",
        sizeLabel: '6"',
        unitPrice: 135,
        pickupDate: "2026-09-10",
        pickupTime: "14:00",
      },
      {
        extraStockId: "peanut-a",
        cakeName: "Salted Peanut",
        sizeLabel: '6"',
        unitPrice: 135,
        pickupDate: "2026-09-10",
        pickupTime: "14:00",
      },
    ],
  });
  const afterBoth = freshPickCatalogueCtaState(
    cards[0]!.extraStockIds,
    cartWithBoth,
  );
  assert.equal(afterBoth.addedToCart, true, "all exact units added");
  assert.equal(afterBoth.addAnotherStockId, null, "no Add another when none remain");
}

{
  const eight = groupPick({
    id: "peanut-8",
    sizeLabel: '8"',
    libraryCakeSizeId: "size-peanut-8",
    days: ["today"],
    unitPrice: 165,
  });
  const cards = groupCustomerFreshPickOfferings([unitA, eight]);
  assert.equal(cards.length, 2, "6\" and 8\" remain separate offerings");
}

{
  const avocado = groupPick({
    id: "avocado-6",
    cakeName: "Avocado",
    libraryCakeId: "cake-avocado",
    libraryCakeSizeId: "size-avocado-6",
    days: ["today"],
  });
  const cards = groupCustomerFreshPickOfferings([unitA, avocado]);
  assert.equal(cards.length, 2, "different cakes remain separate offerings");
}

{
  const differentPrice = groupPick({
    id: "peanut-alt-price",
    days: ["today"],
    unitPrice: 150,
  });
  const cards = groupCustomerFreshPickOfferings([unitA, differentPrice]);
  assert.equal(cards.length, 2, "different price stays a separate offering");
}

{
  const through = "2026-09-19T15:00:00.000Z";
  const now = new Date("2026-09-19T14:00:00.000Z");
  const held = {
    lifecycle: "confirmed" as const,
    pickupThroughAt: through,
    walkInHeldUntil: "2026-09-19T14:15:00.000Z",
    now,
  };
  assert.equal(isPublishedFreshPick(held), true, "held Fresh Pick stays visible");
  assert.equal(
    isCustomerOrderableFreshPick(held),
    false,
    "held Fresh Pick is not orderable",
  );
  assert.equal(
    isPublishedFreshPick({
      ...held,
      walkInHeldUntil: "2026-09-19T13:59:59.000Z",
    }),
    true,
    "expired hold remains visible",
  );
  assert.equal(
    isCustomerOrderableFreshPick({
      ...held,
      walkInHeldUntil: "2026-09-19T13:59:59.000Z",
    }),
    true,
    "expired hold is orderable again",
  );
  assert.equal(
    freshPickCustomerStatusLabel({ walkInHeld: true, days: "today" }),
    FRESH_PICKS_HELD_LABEL,
  );
  assert.equal(
    freshPickCustomerStatusLabel({ walkInHeld: false, days: "today" }),
    "Available today",
  );
}

{
  const available = groupPick({
    id: "peanut-open",
    days: ["today"],
    walkInHeld: false,
  });
  const held = groupPick({
    id: "peanut-held",
    days: ["today", "tomorrow"],
    pickupAvailableFromAt: "2026-09-10T04:00:00.000Z",
    confirmedAt: "2026-09-10T02:00:00.000Z",
    walkInHeld: true,
  });
  const cards = groupCustomerFreshPickOfferings([held, available]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.id, "peanut-open", "orderable unit is the Order target");
  assert.equal(cards[0]?.walkInHeld, false);
  assert.deepEqual(cards[0]?.extraStockIds, ["peanut-open"]);
  assert.deepEqual(cards[0]?.days, ["today"]);
  assert.equal(
    freshPickCustomerStatusLabel({
      walkInHeld: cards[0]!.walkInHeld,
      days: cards[0]!.days,
    }),
    "Available today",
  );
}

{
  const heldA = groupPick({
    id: "peanut-held-a",
    days: ["today"],
    walkInHeld: true,
  });
  const heldB = groupPick({
    id: "peanut-held-b",
    days: ["today"],
    confirmedAt: "2026-09-10T04:00:00.000Z",
    walkInHeld: true,
  });
  const cards = groupCustomerFreshPickOfferings([heldB, heldA]);
  assert.equal(cards[0]?.walkInHeld, true, "all-held offering stays visible");
  assert.deepEqual(cards[0]?.extraStockIds, ["peanut-held-a", "peanut-held-b"]);
  assert.equal(
    freshPickCustomerStatusLabel({
      walkInHeld: cards[0]!.walkInHeld,
      days: cards[0]!.days,
    }),
    "Currently on hold",
  );
}

{
  const released = {
    lifecycle: "confirmed" as const,
    pickupThroughAt: "2026-09-19T15:00:00.000Z",
    walkInHeldUntil: null,
    now: new Date("2026-09-19T14:00:00.000Z"),
  };
  assert.equal(isPublishedFreshPick(released), true, "released hold stays visible");
  assert.equal(
    isCustomerOrderableFreshPick(released),
    true,
    "released hold is orderable",
  );
  assert.equal(
    freshPickCustomerStatusLabel({ walkInHeld: false, days: "today" }),
    "Available today",
  );
}

{
  const heldA = groupPick({
    id: "peanut-held-a",
    days: ["today"],
    walkInHeld: true,
  });
  const heldB = groupPick({
    id: "peanut-held-b",
    days: ["today"],
    confirmedAt: "2026-09-10T04:00:00.000Z",
    walkInHeld: true,
  });
  const cards = groupCustomerFreshPickOfferings([heldB, heldA]);
  assert.equal(cards[0]?.walkInHeld, true, "all-held offering stays visible");
  assert.deepEqual(cards[0]?.extraStockIds, ["peanut-held-a", "peanut-held-b"]);
  assert.equal(
    freshPickCustomerStatusLabel({
      walkInHeld: cards[0]!.walkInHeld,
      days: cards[0]!.days,
    }),
    "Currently on hold",
  );
}

{
  assert.deepEqual(
    unionFreshPickAvailabilityDays([
      { days: ["today"] },
      { days: ["tomorrow"] },
    ]),
    ["today", "tomorrow"],
    "non-overlapping today + tomorrow still union to those two days only",
  );
  assert.deepEqual(
    unionFreshPickAvailabilityDays([{ days: ["today"] }]),
    ["today"],
  );
}

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const extraQueriesSrc = readSrc("src/workspaces/storefront/extra/queries.ts");
assert.match(extraQueriesSrc, /extraActionableFreshPickDays/);
assert.match(extraQueriesSrc, /sortCustomerFreshPicksByAvailabilityDay/);
assert.match(extraQueriesSrc, /groupCustomerFreshPickOfferings/);
assert.match(
  extraQueriesSrc,
  /sortCustomerFreshPicksByAvailabilityDay\(picks\)/,
);
assert.match(extraQueriesSrc, /createPublicClient/);
assert.match(extraQueriesSrc, /isExtraWalkInHeld/);
assert.match(extraQueriesSrc, /freshPickCustomerStatusLabel/);
assert.match(extraQueriesSrc, /walkInHeld/);
assert.doesNotMatch(extraQueriesSrc, /isExtraAvailable\(/);
assert.doesNotMatch(
  extraQueriesSrc,
  /getStorefrontExtraById[\s\S]*groupCustomerFreshPickOfferings/,
  "order page still loads one Extra unit by id",
);
assert.doesNotMatch(extraQueriesSrc, /1 left/);
assert.doesNotMatch(extraQueriesSrc, /2 available/);

const extraPageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontExtraPage.tsx",
);
assert.match(extraPageSrc, /listStorefrontAvailableExtra/);
assert.match(extraPageSrc, /FRESH_PICKS_ADD_TO_CART_CTA/);
assert.match(extraPageSrc, /freshPickCustomerStatusLabel/);
assert.match(extraPageSrc, /pick\.walkInHeld/);
assert.match(extraPageSrc, /FreshPickCatalogueAddCta/);
assert.match(extraPageSrc, /extraStockIds=\{pick\.extraStockIds\}/);
assert.doesNotMatch(extraPageSrc, /Pickup today/);
assert.doesNotMatch(extraPageSrc, /1 left/);
assert.doesNotMatch(extraPageSrc, /2 available/);
assert.match(extraPageSrc, /freshPickAvailabilityDateLabel/);
assert.doesNotMatch(extraPageSrc, /freshPickAvailabilityLabel\(pick\.days\)/);
assert.match(extraPageSrc, /pick\.description/);
assert.match(extraPageSrc, /formatRm/);
assert.doesNotMatch(extraPageSrc, /×\s*2/);
assert.doesNotMatch(extraPageSrc, /x2/);
assert.doesNotMatch(extraPageSrc, /name="quantity"/);
assert.doesNotMatch(extraPageSrc, /units available/i);
assert.doesNotMatch(extraPageSrc, /Through /);
assert.doesNotMatch(extraPageSrc, /Available until/);

const extraFormSrc = readSrc(
  "src/workspaces/storefront/extra/GuestExtraOrderForm.tsx",
);
assert.match(extraFormSrc, /name="extra_stock_id"/);
assert.match(extraFormSrc, /value=\{extra\.id\}/);
assert.match(extraFormSrc, /extraCustomerVisibleFulfilmentDates/);
assert.match(extraFormSrc, /FRESH_PICKS_ADD_TO_CART_CTA/);

const homeFreshSrc = readSrc(
  "src/workspaces/storefront/home/HomeFreshPicksSection.tsx",
);
assert.match(homeFreshSrc, /freshPickCustomerStatusLabel/);
assert.match(homeFreshSrc, /Currently on hold|FRESH_PICKS_HELD_LABEL|walkInHeld/);
assert.match(homeFreshSrc, /freshPickAvailabilityDateLabel/);
assert.match(homeFreshSrc, /status\}\s*\{dateLabel \? ` · \$\{dateLabel\}` : ""\}/);
assert.match(homeFreshSrc, /text-ink text-\[13px\] font-medium leading-snug/);
assert.match(homeFreshSrc, /Order →/);
assert.doesNotMatch(homeFreshSrc, /Pickup today/);
assert.doesNotMatch(homeFreshSrc, /Held by/);
assert.doesNotMatch(homeFreshSrc, /text-status-danger/);
assert.doesNotMatch(homeFreshSrc, /text-skyline text-\[11px\] leading-tight/);

const homePageSrc = readSrc("src/workspaces/storefront/home/StorefrontHomePage.tsx");
assert.match(homePageSrc, /listStorefrontAvailableExtra/);
assert.match(homePageSrc, /sortHomepageFreshPicks/);
assert.match(homePageSrc, /HomeFreshPicksSection picks=\{picks\}/);

const publicHeldVisibleSrc = readSrc(
  "supabase/migrations/20260919120000_extra_stock_public_select_held_visible.sql",
);
assert.match(publicHeldVisibleSrc, /extra_stock_public_confirmed_select/);
assert.match(publicHeldVisibleSrc, /to anon/);
assert.doesNotMatch(
  publicHeldVisibleSrc,
  /walk_in_held_until is null or walk_in_held_until < now\(\)/,
);
assert.match(
  readSrc("supabase/migrations/20260917140000_extra_walk_in_hold.sql"),
  /_assert_extra_stock_not_walk_in_held/,
);

const extraOrderSrc = readSrc(
  "src/workspaces/storefront/extra/StorefrontExtraOrderPage.tsx",
);
assert.match(extraOrderSrc, /extra\.walkInHeld/);
assert.match(extraOrderSrc, /GuestExtraOrderForm/);
assert.doesNotMatch(extraOrderSrc, /walkInHoldCountdownLabel/);

const extraActionsSrc = readSrc("src/workspaces/storefront/extra/actions.ts");
assert.match(extraActionsSrc, /extra\.walkInHeld/);
assert.match(extraActionsSrc, /stillAvailable\.walkInHeld/);

const boardSrc = readSrc("src/workspaces/extra/ExtraBoard.tsx");
assert.doesNotMatch(boardSrc, /selectCustomerFreshPickOfferings/);
assert.match(boardSrc, /freshPicks\.map\(\(unit\)/);

const extraWorkspaceQueriesSrc = readSrc("src/workspaces/extra/queries.ts");
assert.doesNotMatch(extraWorkspaceQueriesSrc, /selectCustomerFreshPickOfferings/);

console.log("PASS customer Fresh Picks offerings (one card per cake)");
