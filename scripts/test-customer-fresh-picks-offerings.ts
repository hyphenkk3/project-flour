/**
 * Customer Fresh Picks: one card per cake offering, not Extra-unit inventory.
 * Run: npx tsx scripts/test-customer-fresh-picks-offerings.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  freshPickOfferingKey,
  selectCustomerFreshPickOfferings,
  type FreshPickOfferingIdentity,
} from "@/engines/extra/customer-fresh-picks";

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

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const extraQueriesSrc = readSrc("src/workspaces/storefront/extra/queries.ts");
assert.match(extraQueriesSrc, /selectCustomerFreshPickOfferings/);
assert.match(extraQueriesSrc, /extraActionableFreshPickDay/);
assert.match(
  extraQueriesSrc,
  /return selectCustomerFreshPickOfferings/,
  "Fresh Picks listing is the customer offering layer",
);
assert.doesNotMatch(
  extraQueriesSrc,
  /getStorefrontExtraById[\s\S]*selectCustomerFreshPickOfferings/,
  "order page still loads one Extra unit by id",
);

const extraPageSrc = readSrc(
  "src/workspaces/storefront/home/StorefrontExtraPage.tsx",
);
assert.match(extraPageSrc, /listStorefrontAvailableExtra/);
assert.match(extraPageSrc, /FRESH_PICKS_ORDER_CTA/);
assert.match(extraPageSrc, /freshPickAvailabilityLabel/);
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
assert.match(extraFormSrc, /extraOrderablePickupDates/);
assert.match(extraFormSrc, /name="customer_name"/);
assert.match(extraFormSrc, /FRESH_PICKS_ORDER_CTA/);

const boardSrc = readSrc("src/workspaces/extra/ExtraBoard.tsx");
assert.doesNotMatch(boardSrc, /selectCustomerFreshPickOfferings/);
assert.match(boardSrc, /freshPicks\.map\(\(unit\)/);

const extraWorkspaceQueriesSrc = readSrc("src/workspaces/extra/queries.ts");
assert.doesNotMatch(extraWorkspaceQueriesSrc, /selectCustomerFreshPickOfferings/);

console.log("PASS customer Fresh Picks offerings (one card per cake)");
