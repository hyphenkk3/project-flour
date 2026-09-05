/**
 * Catalogue cake sizes display in numeric ascending order.
 * Run: npx tsx scripts/test-cake-size-order.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { legacyCakeCategoryEmbed } from "@/engines/menu/cake-categories";
import { sortCakeSizesByNumericLabel } from "@/engines/menu/cake-size-order";
import { formatCakeSizePrices } from "@/workspaces/library/labels";
import { mapCake } from "@/workspaces/library/cakes/queries";

function labels(items: Array<{ label: string }>): string[] {
  return items.map((item) => item.label);
}

function sizesFromLabels(raw: string[]) {
  return raw.map((label, index) => ({
    id: `id-${index}`,
    label,
    sortOrder: index,
  }));
}

assert.deepEqual(
  labels(sortCakeSizesByNumericLabel(sizesFromLabels(['8"', '4"', '6"']), (s) => s.label)),
  ['4"', '6"', '8"'],
);

assert.deepEqual(
  labels(
    sortCakeSizesByNumericLabel(
      sizesFromLabels(['12"', '4"', '10"', '6"', '8"']),
      (s) => s.label,
    ),
  ),
  ['4"', '6"', '8"', '10"', '12"'],
);

assert.notDeepEqual(
  ['12"', '4"', '10"', '6"', '8"'].sort(),
  ['4"', '6"', '8"', '10"', '12"'],
  "lexical/array sort must not be the catalogue rule",
);

const mapped = mapCake({
  id: "cake-1",
  name: "Scrambled",
  ...legacyCakeCategoryEmbed("classic"),
  description: null,
  sharing_guide: null,
  allergens: [],
  bakery_notes: null,
  status: "active",
  created_at: "2026-08-16T00:00:00.000Z",
  updated_at: "2026-08-16T00:00:00.000Z",
  library_cake_sizes: [
    {
      id: "s8",
      cake_id: "cake-1",
      label: '8"',
      price: 165,
      sort_order: 0,
    },
    {
      id: "s4",
      cake_id: "cake-1",
      label: '4"',
      price: 75,
      sort_order: 1,
    },
    {
      id: "s6",
      cake_id: "cake-1",
      label: '6"',
      price: 125,
      sort_order: 2,
    },
  ],
});
assert.deepEqual(
  mapped.sizes.map((size) => size.label),
  ['4"', '6"', '8"'],
);
assert.deepEqual(
  mapped.sizes.map((size) => size.sortOrder),
  [1, 2, 0],
  "stored sort_order is left unchanged; display order is numeric",
);

assert.equal(
  formatCakeSizePrices([
    { label: '12"', price: 245 },
    { label: '4"', price: 75 },
    { label: '10"', price: 205 },
    { label: '6"', price: 125 },
    { label: '8"', price: 165 },
  ]),
  '4" — RM75 · 6" — RM125 · 8" — RM165 · 10" — RM205 · 12" — RM245',
);

const libraryQueries = readFileSync(
  resolve(process.cwd(), "src/workspaces/library/cakes/queries.ts"),
  "utf8",
);
const storefrontQueries = readFileSync(
  resolve(process.cwd(), "src/workspaces/storefront/catalog/queries.ts"),
  "utf8",
);
assert.match(libraryQueries, /sortCakeSizesByNumericLabel/);
assert.match(storefrontQueries, /sortCakeSizesByNumericLabel/);
assert.doesNotMatch(
  libraryQueries,
  /a\.sortOrder - b\.sortOrder/,
);
assert.doesNotMatch(
  storefrontQueries,
  /a\.sortOrder - b\.sortOrder/,
);

console.log("PASS cake size numeric display order");
