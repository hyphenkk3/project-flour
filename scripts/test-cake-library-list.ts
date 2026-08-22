/**
 * Cake Library list sorting and filtering.
 * Run: npx tsx scripts/test-cake-library-list.ts
 */
import assert from "node:assert/strict";
import {
  DEFAULT_LIBRARY_CAKE_SORT,
  LIBRARY_CAKE_STATUS_ORDER,
  libraryCakeLowestPrice,
  libraryCakeSmallestSizeValue,
  sortLibraryCakes,
} from "@/engines/menu/cake-library-list";
import { cakeSizeNumericValue } from "@/engines/menu/cake-size-order";
import type {
  LibraryCake,
  LibraryCakeCategory,
  LibraryCakeStatus,
} from "@/types/library-cake";
import { mapCake } from "@/workspaces/library/cakes/queries";
import {
  applyLibraryCakeDirectory,
  filterLibraryCakes,
} from "@/workspaces/library/cakes/directory-view";
import { LIBRARY_CAKE_STATUSES } from "@/workspaces/library/labels";

assert.deepEqual(
  LIBRARY_CAKE_STATUS_ORDER,
  LIBRARY_CAKE_STATUSES,
  "Status sort order matches Library cake statuses",
);
assert.equal(DEFAULT_LIBRARY_CAKE_SORT, "name_asc");

type SizeInput = { label: string; price: number; sort_order?: number };

function cake(input: {
  id: string;
  name: string;
  category: LibraryCakeCategory;
  status: LibraryCakeStatus;
  updated_at: string;
  sizes: SizeInput[];
}): LibraryCake {
  return mapCake({
    id: input.id,
    name: input.name,
    category: input.category,
    description: null,
    sharing_guide: null,
    allergens: [],
    bakery_notes: null,
    status: input.status,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: input.updated_at,
    library_cake_sizes: input.sizes.map((size, index) => ({
      id: `${input.id}-size-${index}`,
      cake_id: input.id,
      label: size.label,
      price: size.price,
      sort_order: size.sort_order ?? index,
    })),
  });
}

const banana = cake({
  id: "banana",
  name: "Banana",
  category: "classic",
  status: "active",
  updated_at: "2026-08-10T08:00:00.000Z",
  sizes: [
    { label: '8"', price: 165, sort_order: 0 },
    { label: '4"', price: 75, sort_order: 1 },
    { label: '6"', price: 125, sort_order: 2 },
  ],
});
const apple = cake({
  id: "apple",
  name: "Apple",
  category: "classic",
  status: "draft",
  updated_at: "2026-08-16T08:00:00.000Z",
  sizes: [
    { label: '12"', price: 245, sort_order: 0 },
    { label: '6"', price: 125, sort_order: 1 },
  ],
});
const cherry = cake({
  id: "cherry",
  name: "Cherry",
  category: "celebration",
  status: "active",
  updated_at: "2026-08-12T08:00:00.000Z",
  sizes: [
    { label: '10"', price: 205, sort_order: 0 },
    { label: '8"', price: 165, sort_order: 1 },
  ],
});
const durian = cake({
  id: "durian",
  name: "Durian",
  category: "specialty",
  status: "seasonal",
  updated_at: "2026-08-14T08:00:00.000Z",
  sizes: [],
});
const elderflower = cake({
  id: "elderflower",
  name: "Elderflower",
  category: "other",
  status: "retired",
  updated_at: "2026-08-02T08:00:00.000Z",
  sizes: [{ label: '12"', price: 300 }],
});
const fig = cake({
  id: "fig",
  name: "Fig",
  category: "seasonal",
  status: "ready_for_release",
  updated_at: "2026-08-11T08:00:00.000Z",
  sizes: [{ label: '4"', price: 80 }],
});

const catalogue = [banana, apple, cherry, durian, elderflower, fig];

function names(cakes: LibraryCake[]): string[] {
  return cakes.map((item) => item.name);
}

assert.deepEqual(banana.sizes.map((size) => size.label), ['4"', '6"', '8"']);
assert.deepEqual(
  banana.sizes.map((size) => size.sortOrder),
  [1, 2, 0],
  "stored sort_order is unchanged; display sizes are numeric",
);
assert.equal(libraryCakeLowestPrice(banana), 75);
assert.equal(libraryCakeSmallestSizeValue(banana), 4);
assert.equal(libraryCakeLowestPrice(durian), null);
assert.equal(libraryCakeSmallestSizeValue(durian), null);
assert.equal(cakeSizeNumericValue('10"') > cakeSizeNumericValue('8"'), true);

assert.deepEqual(names(sortLibraryCakes(catalogue, "name_asc")), [
  "Apple",
  "Banana",
  "Cherry",
  "Durian",
  "Elderflower",
  "Fig",
]);
assert.deepEqual(names(sortLibraryCakes(catalogue, "name_desc")), [
  "Fig",
  "Elderflower",
  "Durian",
  "Cherry",
  "Banana",
  "Apple",
]);

const byPriceLow = sortLibraryCakes(catalogue, "price_asc");
assert.deepEqual(names(byPriceLow), [
  "Banana",
  "Fig",
  "Apple",
  "Cherry",
  "Elderflower",
  "Durian",
]);
assert.equal(libraryCakeLowestPrice(byPriceLow[0]!), 75);
assert.equal(
  names(sortLibraryCakes(catalogue, "price_desc"))[0],
  "Elderflower",
);

const sameLowestPrice = sortLibraryCakes(
  [
    cake({
      id: "walnut",
      name: "Walnut",
      category: "classic",
      status: "active",
      updated_at: "2026-08-10T00:00:00.000Z",
      sizes: [
        { label: '8"', price: 165 },
        { label: '4"', price: 75 },
      ],
    }),
    cake({
      id: "almond",
      name: "Almond",
      category: "classic",
      status: "active",
      updated_at: "2026-08-10T00:00:00.000Z",
      sizes: [{ label: '6"', price: 75 }],
    }),
  ],
  "price_asc",
);
assert.deepEqual(names(sameLowestPrice), ["Almond", "Walnut"]);

const sizeOrderCakes = [
  cake({
    id: "s12",
    name: "Twelve",
    category: "classic",
    status: "active",
    updated_at: "2026-08-10T00:00:00.000Z",
    sizes: [{ label: '12"', price: 245 }],
  }),
  cake({
    id: "s4",
    name: "Four",
    category: "classic",
    status: "active",
    updated_at: "2026-08-10T00:00:00.000Z",
    sizes: [{ label: '4"', price: 75 }],
  }),
  cake({
    id: "s10",
    name: "Ten",
    category: "classic",
    status: "active",
    updated_at: "2026-08-10T00:00:00.000Z",
    sizes: [{ label: '10"', price: 205 }],
  }),
  cake({
    id: "s6",
    name: "Six",
    category: "classic",
    status: "active",
    updated_at: "2026-08-10T00:00:00.000Z",
    sizes: [{ label: '6"', price: 125 }],
  }),
  cake({
    id: "s8",
    name: "Eight",
    category: "classic",
    status: "active",
    updated_at: "2026-08-10T00:00:00.000Z",
    sizes: [{ label: '8"', price: 165 }],
  }),
];
assert.deepEqual(
  sortLibraryCakes(sizeOrderCakes, "size_asc").map(
    (item) => libraryCakeSmallestSizeValue(item),
  ),
  [4, 6, 8, 10, 12],
);
assert.deepEqual(names(sortLibraryCakes(sizeOrderCakes, "size_asc")), [
  "Four",
  "Six",
  "Eight",
  "Ten",
  "Twelve",
]);
assert.deepEqual(names(sortLibraryCakes(sizeOrderCakes, "size_desc")), [
  "Twelve",
  "Ten",
  "Eight",
  "Six",
  "Four",
]);
assert.equal(names(sortLibraryCakes(catalogue, "size_asc")).at(-1), "Durian");
assert.equal(names(sortLibraryCakes(catalogue, "size_desc")).at(-1), "Durian");
assert.equal(names(sortLibraryCakes(catalogue, "price_asc")).at(-1), "Durian");
assert.equal(names(sortLibraryCakes(catalogue, "price_desc")).at(-1), "Durian");

assert.deepEqual(names(sortLibraryCakes(catalogue, "category_asc")), [
  "Cherry",
  "Apple",
  "Banana",
  "Elderflower",
  "Fig",
  "Durian",
]);
assert.deepEqual(names(sortLibraryCakes(catalogue, "category_desc"))[0], "Durian");

assert.deepEqual(names(sortLibraryCakes(catalogue, "status_asc")), [
  "Apple",
  "Fig",
  "Banana",
  "Cherry",
  "Durian",
  "Elderflower",
]);
assert.equal(names(sortLibraryCakes(catalogue, "status_desc"))[0], "Elderflower");

assert.deepEqual(names(sortLibraryCakes(catalogue, "updated_desc")), [
  "Apple",
  "Durian",
  "Cherry",
  "Fig",
  "Banana",
  "Elderflower",
]);
assert.deepEqual(names(sortLibraryCakes(catalogue, "updated_asc")), [
  "Elderflower",
  "Banana",
  "Fig",
  "Cherry",
  "Durian",
  "Apple",
]);

assert.deepEqual(
  names(applyLibraryCakeDirectory(catalogue, { sort: DEFAULT_LIBRARY_CAKE_SORT })),
  names(sortLibraryCakes(catalogue, "name_asc")),
);

assert.deepEqual(
  names(filterLibraryCakes(catalogue, { category: "classic" })),
  ["Banana", "Apple"],
);
assert.deepEqual(
  names(
    applyLibraryCakeDirectory(catalogue, {
      category: "classic",
      sort: "name_asc",
    }),
  ),
  ["Apple", "Banana"],
);
assert.deepEqual(
  names(filterLibraryCakes(catalogue, { status: "active" })).sort((a, b) =>
    a.localeCompare(b, "en"),
  ),
  ["Banana", "Cherry"],
);
assert.deepEqual(
  names(filterLibraryCakes(catalogue, { query: "celeb" })),
  ["Cherry"],
);
assert.deepEqual(
  names(
    applyLibraryCakeDirectory(catalogue, {
      query: "classic",
      sort: "name_asc",
    }),
  ),
  ["Apple", "Banana"],
);

console.log("PASS cake library list sorting and filtering");
