/**
 * Cake category master-list helpers.
 * Display names and sort order come from library_cake_categories, not enums.
 */

export type CakeCategoryRecord = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type CakeCategoryRef = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

/** Customer-facing category set. Owner/Manager may still rename/reorder. */
export const CUSTOMER_CAKE_CATEGORY_NAMES = [
  "Chocolate",
  "Fruit",
  "Tea",
  "Local Inspired",
  "Nutty",
] as const;

export const CAKE_CATEGORY_ASSIGNMENT_MAX = 2;

export const AGREED_CUSTOMER_CAKE_CATEGORY_ASSIGNMENTS: ReadonlyArray<{
  cakeName: string;
  categories: readonly (typeof CUSTOMER_CAKE_CATEGORY_NAMES)[number][];
}> = [
  { cakeName: "Avocado", categories: ["Fruit"] },
  {
    cakeName: "Dubai Chocolate Kunafa (Slightly Sweeter)",
    categories: ["Chocolate", "Nutty"],
  },
  {
    cakeName: "Pistachio Chocolate (Less Sweet)",
    categories: ["Chocolate", "Nutty"],
  },
  { cakeName: "Salted Peanut", categories: ["Nutty"] },
  { cakeName: "Pistachio Raspberry Kiss", categories: ["Fruit", "Nutty"] },
  { cakeName: "Signature Yam", categories: ["Local Inspired"] },
  { cakeName: "Chocolate Strawberry", categories: ["Chocolate", "Fruit"] },
  { cakeName: "Nutty Macadamia", categories: ["Nutty"] },
  { cakeName: "Japanese Strawberry", categories: ["Fruit"] },
  { cakeName: "Mangolicious Symphony", categories: ["Fruit"] },
  { cakeName: "Nenek's Slice (Salted Pandan)", categories: ["Local Inspired"] },
  { cakeName: "Pandan Mango", categories: ["Local Inspired", "Fruit"] },
  { cakeName: "Matcha Passionfruit", categories: ["Tea", "Fruit"] },
  {
    cakeName: "Red Dates Serenade Delight",
    categories: ["Local Inspired", "Fruit"],
  },
  { cakeName: "Pistachio Mango Crescendo", categories: ["Fruit", "Nutty"] },
  { cakeName: "Oolong Rose Lychee", categories: ["Tea", "Fruit"] },
  { cakeName: "Earl Grey Pistachio", categories: ["Tea", "Nutty"] },
  { cakeName: "Chocolate D'Amour", categories: ["Chocolate"] },
  {
    cakeName: "Decadent Chocolate  (Dark Chocolate, Slightly Sweeter)",
    categories: ["Chocolate"],
  },
  { cakeName: "Refreshing Lemon", categories: ["Fruit"] },
];

/** Historical enum slugs → seeded master-list names. Used only for migration/tests. */
export const LEGACY_LIBRARY_CAKE_CATEGORIES = [
  { slug: "celebration", name: "Celebration", sortOrder: 1 },
  { slug: "classic", name: "Classic", sortOrder: 2 },
  { slug: "seasonal", name: "Seasonal", sortOrder: 3 },
  { slug: "specialty", name: "Specialty", sortOrder: 4 },
  { slug: "other", name: "Other", sortOrder: 5 },
] as const;

export type LegacyLibraryCakeCategorySlug =
  (typeof LEGACY_LIBRARY_CAKE_CATEGORIES)[number]["slug"];

export function legacyCakeCategoryId(
  slug: LegacyLibraryCakeCategorySlug,
): string {
  return `legacy-${slug}`;
}

export function legacyCakeCategoryFields(
  slug: LegacyLibraryCakeCategorySlug,
): {
  categoryId: string;
  categoryName: string;
  categoryActive: boolean;
  categorySortOrder: number;
  categories: CakeCategoryRef[];
} {
  const row = LEGACY_LIBRARY_CAKE_CATEGORIES.find((entry) => entry.slug === slug);
  if (!row) {
    throw new Error(`Unknown legacy cake category: ${slug}`);
  }
  const category: CakeCategoryRef = {
    id: legacyCakeCategoryId(slug),
    name: row.name,
    isActive: true,
    sortOrder: row.sortOrder,
  };
  return {
    categoryId: category.id,
    categoryName: category.name,
    categoryActive: true,
    categorySortOrder: category.sortOrder,
    categories: [category],
  };
}

export function legacyCakeCategoryEmbed(slug: LegacyLibraryCakeCategorySlug): {
  category_id: string;
  library_cake_categories: {
    id: string;
    name: string;
    is_active: boolean;
    sort_order: number;
  };
} {
  const fields = legacyCakeCategoryFields(slug);
  return {
    category_id: fields.categoryId,
    library_cake_categories: {
      id: fields.categoryId,
      name: fields.categoryName,
      is_active: fields.categoryActive,
      sort_order: fields.categorySortOrder,
    },
  };
}

export function normalizeCakeCategoryName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) return null;
  return name;
}

export function sortCakeCategories<T extends { sortOrder: number; name: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "en"),
  );
}

export function activeCakeCategories<T extends { isActive: boolean }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => row.isActive);
}

export function cakeEditorCategoryOptions<
  T extends { id: string; isActive: boolean; sortOrder: number; name: string },
>(
  rows: readonly T[],
  currentIds?: string | readonly string[] | null,
): T[] {
  const allowed = new Set(
    (Array.isArray(currentIds)
      ? currentIds
      : currentIds
        ? [currentIds]
        : []
    ).map((id) => id.trim()).filter(Boolean),
  );
  return sortCakeCategories(rows).filter(
    (row) => row.isActive || allowed.has(row.id),
  );
}

export function parseCakeCategoryAssignmentIds(
  raw: readonly string[],
): string[] | string {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length > CAKE_CATEGORY_ASSIGNMENT_MAX) {
    return `Choose up to ${CAKE_CATEGORY_ASSIGNMENT_MAX} categories.`;
  }
  return ids;
}

export function cakeCategoryRefsFromPrimary(input: {
  categoryId?: string | null;
  categoryName?: string | null;
  categoryActive?: boolean;
  categorySortOrder?: number;
  categories?: readonly CakeCategoryRef[] | null;
}): CakeCategoryRef[] {
  if (Array.isArray(input.categories)) {
    return sortCakeCategories(input.categories);
  }
  const id = input.categoryId?.trim() ?? "";
  if (!id) return [];
  return [
    {
      id,
      name: input.categoryName?.trim() || id,
      isActive: input.categoryActive ?? true,
      sortOrder: input.categorySortOrder ?? 0,
    },
  ];
}

export function cakeHasCategoryId(
  cake: {
    categoryId?: string | null;
    categories?: readonly CakeCategoryRef[] | null;
  },
  categoryId: string,
): boolean {
  const needle = categoryId.trim();
  if (!needle) return false;
  if (Array.isArray(cake.categories)) {
    return cake.categories.some((row) => row.id === needle);
  }
  return (cake.categoryId?.trim() ?? "") === needle;
}

/** OR match: a cake with Chocolate + Fruit matches either selected id. */
export function cakeHasAnyCategoryId(
  cake: {
    categoryId?: string | null;
    categories?: readonly CakeCategoryRef[] | null;
  },
  categoryIds: readonly string[],
): boolean {
  return categoryIds.some((id) => cakeHasCategoryId(cake, id));
}

export function formatCakeCategoryNames(
  categories: readonly Pick<CakeCategoryRef, "name" | "sortOrder">[],
): string {
  return sortCakeCategories(categories)
    .map((row) => row.name.trim())
    .filter(Boolean)
    .join(" · ");
}

export function primaryCakeCategory(
  categories: readonly CakeCategoryRef[],
): CakeCategoryRef | null {
  return sortCakeCategories(categories)[0] ?? null;
}

export function cakeCategoryOptionLabel(
  category: Pick<CakeCategoryRecord, "name" | "isActive">,
): string {
  return category.isActive ? category.name : `${category.name} (inactive)`;
}

export function nextCakeCategorySortOrder(
  rows: readonly { sortOrder: number }[],
): number {
  if (rows.length === 0) return 1;
  return Math.max(...rows.map((row) => row.sortOrder)) + 1;
}

export function moveCakeCategoryInOrder<
  T extends { id: string; sortOrder: number; name: string },
>(rows: readonly T[], id: string, direction: -1 | 1): T[] {
  const sorted = sortCakeCategories(rows);
  const index = sorted.findIndex((row) => row.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= sorted.length) {
    return sorted.map((row, sortOrder) => ({
      ...row,
      sortOrder: sortOrder + 1,
    }));
  }
  const copy = [...sorted];
  const current = copy[index];
  const neighbor = copy[nextIndex];
  if (!current || !neighbor) return copy;
  copy[index] = neighbor;
  copy[nextIndex] = current;
  return copy.map((row, sortOrder) => ({ ...row, sortOrder: sortOrder + 1 }));
}

export function browseCategoryOptionsFromCakes(
  cakes: readonly {
    categoryId: string | null;
    categoryName: string | null;
    categoryActive: boolean;
    categorySortOrder: number;
    categories?: readonly CakeCategoryRef[] | null;
  }[],
): Array<{ value: string; label: string }> {
  const byId = new Map<
    string,
    { label: string; sortOrder: number }
  >();
  for (const cake of cakes) {
    for (const category of cakeCategoryRefsFromPrimary(cake)) {
      if (!category.isActive) continue;
      const id = category.id.trim();
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        label: category.name.trim() || id,
        sortOrder:
          cake.categoryId?.trim() === id
            ? cake.categorySortOrder
            : category.sortOrder,
      });
    }
  }
  return [...byId.entries()]
    .sort(
      (a, b) =>
        a[1].sortOrder - b[1].sortOrder ||
        a[1].label.localeCompare(b[1].label, "en"),
    )
    .map(([value, { label }]) => ({ value, label }));
}

export function isMissingCakeCategoryAssignmentSchema(message: string): boolean {
  return /library_cake_category_assignments/i.test(message);
}

export function omitCakeCategoryAssignmentEmbed(select: string): string {
  return select.replace(
    /\n\s*library_cake_category_assignments(?:!cake_id)? \(\s*category_id,\s*sort_order,\s*library_cake_categories(?:!category_id)? \(\s*id,\s*name,\s*is_active,\s*sort_order\s*\)\s*\),/g,
    "",
  );
}

export function categoryNameConflicts(
  rows: readonly { id: string; name: string }[],
  name: string,
  exceptId?: string,
): boolean {
  const needle = name.trim().toLowerCase();
  return rows.some(
    (row) =>
      row.id !== exceptId && row.name.trim().toLowerCase() === needle,
  );
}
