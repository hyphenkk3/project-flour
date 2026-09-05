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
} {
  const row = LEGACY_LIBRARY_CAKE_CATEGORIES.find((entry) => entry.slug === slug);
  if (!row) {
    throw new Error(`Unknown legacy cake category: ${slug}`);
  }
  return {
    categoryId: legacyCakeCategoryId(slug),
    categoryName: row.name,
    categoryActive: true,
    categorySortOrder: row.sortOrder,
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
>(rows: readonly T[], currentId?: string | null): T[] {
  const current = currentId?.trim() ?? "";
  return sortCakeCategories(rows).filter(
    (row) => row.isActive || row.id === current,
  );
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
  }[],
): Array<{ value: string; label: string }> {
  const byId = new Map<
    string,
    { label: string; sortOrder: number }
  >();
  for (const cake of cakes) {
    const id = cake.categoryId?.trim() ?? "";
    if (!id || !cake.categoryActive) continue;
    if (byId.has(id)) continue;
    byId.set(id, {
      label: cake.categoryName?.trim() || id,
      sortOrder: cake.categorySortOrder,
    });
  }
  return [...byId.entries()]
    .sort(
      (a, b) =>
        a[1].sortOrder - b[1].sortOrder ||
        a[1].label.localeCompare(b[1].label, "en"),
    )
    .map(([value, { label }]) => ({ value, label }));
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
