/**
 * Cake merchandising tag helpers.
 * Display names are the customer-facing names. No separate internal slug map.
 */

export type CakeTagRecord = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type CakeTagRef = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

/** Seeded merchandising tags. Owner/Manager may add more later. */
export const SEEDED_CAKE_TAG_NAMES = [
  "New!",
  "Popular",
  "Back Again",
  "Seasonal",
  "Limited",
] as const;

export const AGREED_CUSTOMER_CAKE_TAG_ASSIGNMENTS: ReadonlyArray<{
  cakeName: string;
  tags: readonly (typeof SEEDED_CAKE_TAG_NAMES)[number][];
}> = [
  { cakeName: "Avocado", tags: ["Limited"] },
  { cakeName: "Japanese Strawberry", tags: ["Limited"] },
];

export function normalizeCakeTagName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) return null;
  return name;
}

export function sortCakeTags<T extends { sortOrder: number; name: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "en"),
  );
}

export function activeCakeTags<T extends { isActive: boolean }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => row.isActive);
}

export function cakeEditorTagOptions<
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
    )
      .map((id) => id.trim())
      .filter(Boolean),
  );
  return sortCakeTags(rows).filter(
    (row) => row.isActive || allowed.has(row.id),
  );
}

export function parseCakeTagAssignmentIds(raw: readonly string[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function customerFacingCakeTags(
  tags: readonly CakeTagRef[] | null | undefined,
): CakeTagRef[] {
  return sortCakeTags((tags ?? []).filter((row) => row.isActive));
}

export function formatCakeTagNames(
  tags: readonly Pick<CakeTagRef, "name" | "sortOrder" | "isActive">[],
  options?: { includeInactive?: boolean },
): string {
  const rows = sortCakeTags(tags).filter(
    (row) => options?.includeInactive || row.isActive,
  );
  return rows
    .map((row) => row.name.trim())
    .filter(Boolean)
    .join(" · ");
}

export function cakeTagOptionLabel(
  tag: Pick<CakeTagRecord, "name" | "isActive">,
): string {
  return tag.isActive ? tag.name : `${tag.name} (inactive)`;
}

export function nextCakeTagSortOrder(
  rows: readonly { sortOrder: number }[],
): number {
  if (rows.length === 0) return 1;
  return Math.max(...rows.map((row) => row.sortOrder)) + 1;
}

export function moveCakeTagInOrder<
  T extends { id: string; sortOrder: number; name: string },
>(rows: readonly T[], id: string, direction: -1 | 1): T[] {
  const sorted = sortCakeTags(rows);
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

export function tagNameConflicts(
  rows: readonly { id: string; name: string }[],
  name: string,
  exceptId?: string,
): boolean {
  const needle = name.trim().toLowerCase();
  return rows.some(
    (row) => row.id !== exceptId && row.name.trim().toLowerCase() === needle,
  );
}

export function isMissingCakeTagAssignmentSchema(message: string): boolean {
  return /library_cake_tag_assignments|library_cake_tags/i.test(message);
}

export function omitCakeTagAssignmentEmbed(select: string): string {
  return select.replace(
    /\n\s*library_cake_tag_assignments(?:!cake_id)? \(\s*tag_id,\s*sort_order,\s*library_cake_tags(?:!tag_id)? \(\s*id,\s*name,\s*is_active,\s*sort_order\s*\)\s*\),/g,
    "",
  );
}
