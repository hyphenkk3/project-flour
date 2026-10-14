/** Local-only unit and direct Server Action tests. No .env or live services. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { parsePreorderDays } from "@/engines/preorder/lead";
import { parseNonNegativeNumber } from "@/workspaces/library/labels";
import * as availability from "@/engines/menu/cake-size-availability";
import { resolveCakeSizePriceOn } from "@/engines/orders/cake-size-price";
import { storefrontPhotoForSize } from "@/workspaces/storefront/catalog/cake-photo-map";
import { draftItemSizeChoices } from "@/workspaces/storefront/cart/cart-order-summary";
import {
  emptyPreorderDraft,
  mergeDraftItem,
} from "@/workspaces/storefront/checkout/preorder-draft";
const {
  cakeSizeAvailability: check,
  cakeSizeAvailabilityRangeError: range,
  validCakeSizeSelection: selection,
} = availability;
const cakeId = "10000000-0000-0000-0000-000000000001";
const fourId = "20000000-0000-0000-0000-000000000004";
const sixId = "20000000-0000-0000-0000-000000000006";
const four = {
  id: fourId,
  cakeId,
  size: '4"',
  price: 78,
  sortOrder: 0,
  preorderDays: 2,
  availableFrom: "2026-11-01",
  availableUntil: null,
};
const six = { ...four, id: sixId, size: '6"', price: 125, availableFrom: null };
const photos = [
  {
    id: "default",
    url: "/default.jpg",
    altText: null,
    sortOrder: 0,
    cakeSizeId: null,
    isDefault: true,
  },
  {
    id: "four",
    url: "/four.jpg",
    altText: null,
    sortOrder: 1,
    cakeSizeId: fourId,
    isDefault: false,
  },
  {
    id: "six",
    url: "/six.jpg",
    altText: null,
    sortOrder: 2,
    cakeSizeId: sixId,
    isDefault: false,
  },
];
const cake = {
  id: cakeId,
  name: "Thai Milk Tea Mango",
  description: null,
  sharingGuide: null,
  allergens: [],
  image: "/default.jpg",
  photos,
  sizes: [four, six],
};
assert.equal(check({}, null).available, true);
assert.equal(
  check({ availableFrom: null, availableUntil: null }, "2026-10-31").available,
  true,
);
assert.equal(check(four, "2026-10-31").available, false);
assert.equal(check(four, "2026-11-01").available, true);
assert.equal(check(four, "2026-11-30").available, true);
assert.equal(
  check({ ...four, availableUntil: "2026-11-30" }, "2026-11-30").available,
  true,
);
assert.equal(
  check({ ...four, availableUntil: "2026-11-30" }, "2026-12-01").available,
  false,
);
assert.equal(
  check({ availableUntil: "2026-10-31" }, "2026-10-31").available,
  true,
);
assert.equal(
  check({ availableUntil: "2026-10-31" }, "2026-11-01").available,
  false,
);
assert.equal(check(four, null).available, false);
assert.match(
  check(four, null).message!,
  /Available from 1 Nov 2026.*Select a pickup date/,
);
assert.equal(check(four, "2026-02-30").available, false);
assert.match(range("2026-11-01", "2026-10-31")!, /earlier/);
assert.match(range("2026-02-30", null)!, /valid/);
assert.equal(range(null, null), null);
assert.equal(range("2026-11-01", "2026-11-01"), null);
assert.equal(check(six, "2026-10-31").available, true);
assert.equal(check(six, "2026-11-01").available, true);
assert.equal(selection(cake.sizes, fourId, "2026-11-01"), fourId);
assert.equal(selection(cake.sizes, fourId, "2026-10-31"), "");
assert.equal(selection(cake.sizes, "", "2026-11-01"), ""); // No automatic substitution/restoration.
assert.equal(storefrontPhotoForSize(photos, fourId)?.url, "/four.jpg");
assert.equal(storefrontPhotoForSize(photos, sixId)?.url, "/six.jpg");
assert.equal(
  storefrontPhotoForSize(photos, selection(cake.sizes, fourId, "2026-10-31"))
    ?.url,
  "/default.jpg",
);
assert.equal(
  resolveCakeSizePriceOn({
    basePrice: 78,
    schedules: [{ price: 88, effectiveFrom: "2026-11-01", effectiveTo: null }],
    pickupDate: "2026-11-01",
  }),
  88,
);
const item = {
  cakeId,
  sizeId: fourId,
  quantity: 1,
  cakeName: cake.name,
  sizeLabel: four.size,
  unitPrice: 78,
};
assert.equal(draftItemSizeChoices(item, cake)[0].availableFrom, "2026-11-01");
assert.equal(mergeDraftItem(emptyPreorderDraft(), item).items[0].unitPrice, 78);
// Execute the real server action source with only its database loader replaced.
// The loader is deliberately changed between requests to model an old browser snapshot.
let liveCakes: (typeof cake)[] = [cake];
let loads = 0;
const exports: Record<string, any> = {};
const source = readFileSync(
  "src/workspaces/storefront/cart/actions.ts",
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
vm.runInNewContext(compiled, {
  exports,
  require: (name: string) => {
    if (name.includes("cake-size-availability")) return availability;
    if (name.includes("catalog/queries"))
      return {
        listStorefrontCakesByIds: async () => {
          loads++;
          return liveCakes;
        },
      };
    throw new Error(`Unexpected dependency ${name}`);
  },
});
const adminSource = readFileSync(
  "src/workspaces/library/cakes/actions.ts",
  "utf8",
);
const parserSource = adminSource.slice(
  adminSource.indexOf("function parseSizes("),
  adminSource.indexOf("async function parseCakeInput("),
);
const parserExports: Record<string, any> = {};
vm.runInNewContext(
  ts.transpileModule(parserSource + "\nexports.parseSizes = parseSizes;", {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  {
    exports: parserExports,
    parsePreorderDays,
    parseNonNegativeNumber,
    cakeSizeAvailabilityRangeError: range,
  },
);
function sizeForm(from: string, until: string) {
  const data = new FormData();
  for (const [name, value] of Object.entries({
    size_id: fourId,
    size_label: '4"',
    size_price: "78",
    size_preorder_days: "2",
    size_available_from: from,
    size_available_until: until,
  }))
    data.append(name, value);
  return data;
}
const adminParsed = parserExports.parseSizes(sizeForm("2026-11-01", ""));
assert.equal(adminParsed[0].id, fourId);
assert.equal(adminParsed[0].price, 78);
assert.equal(adminParsed[0].availableFrom, "2026-11-01");
assert.equal(adminParsed[0].availableUntil, null);
assert.match(
  parserExports.parseSizes(sizeForm("2026-11-01", "2026-10-31")),
  /earlier/,
);
assert.match(
  parserExports.parseSizes(sizeForm("2026-11-01T00:00:00Z", "")),
  /valid availability dates/,
);
const cleared = parserExports.parseSizes(sizeForm("", ""));
assert.equal(cleared[0].availableFrom, null);
assert.equal(cleared[0].availableUntil, null);
async function main() {
  const validate = exports.validateCartSizeAvailability;
  assert.match(
    (await validate([item], "2026-10-31")).error,
    /Available from 1 Nov 2026/,
  );
  assert.equal((await validate([item], "2026-11-01")).error, null);
  assert.match((await validate([item], null)).error, /Select a pickup date/);
  assert.equal((await validate([{ cakeId, sizeId: sixId }], null)).error, null);
  assert.match(
    (await validate([{ cakeId: "bad", sizeId: fourId }], "2026-11-01")).error,
    /valid cake sizes/,
  );
  assert.match(
    (await validate([item], "2026-02-30")).error,
    /valid pickup date/,
  );
  assert.match(
    (
      await validate(
        [{ cakeId: "10000000-0000-0000-0000-000000000002", sizeId: fourId }],
        "2026-11-01",
      )
    ).error,
    /no longer available/,
  );
  liveCakes = [
    { ...cake, sizes: [{ ...four, availableFrom: "2026-12-01" }, six] },
  ];
  assert.match(
    (await validate([item], "2026-11-01")).error,
    /Available from 1 Dec 2026/,
  );
  assert.ok(
    loads >= 6,
    "Server reloads live availability on each valid direct request",
  );
  assert.match(
    readFileSync(
      "supabase/migrations/20260920220000_waiting_list_confirmation_convert.sql",
      "utf8",
    ),
    /public\.create_staff_guest_preorder\(/,
  );
  console.log(
    "PASS: availability boundaries, invalid ranges, no date, date changes, no substitution, photos, pricing, unchanged sizes, direct Server Action requests and stale carts",
  );
}
void main();
