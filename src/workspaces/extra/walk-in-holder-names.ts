export type WalkInHolderNameFields = {
  walkInHeldBy: string | null;
  walkInHeldByName: string | null;
};

export function uniqueWalkInHolderIds(
  units: readonly Pick<WalkInHolderNameFields, "walkInHeldBy">[],
): string[] {
  return [
    ...new Set(
      units
        .map((unit) => unit.walkInHeldBy)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

/**
 * Fill holder names only for staff IDs already present in authorized stock rows.
 * A failed presentation lookup keeps the existing safe generic fallback.
 */
export async function hydrateWalkInHolderNames<
  T extends WalkInHolderNameFields,
>(
  units: readonly T[],
  lookup: (holderIds: string[]) => Promise<ReadonlyMap<string, string>>,
): Promise<T[]> {
  const holderIds = uniqueWalkInHolderIds(units);
  if (holderIds.length === 0) return units.map((unit) => unit);

  let names: ReadonlyMap<string, string>;
  try {
    names = await lookup(holderIds);
  } catch {
    return units.map((unit) => unit);
  }

  return units.map((unit) => {
    const name = unit.walkInHeldBy
      ? names.get(unit.walkInHeldBy)?.trim()
      : undefined;
    return name ? { ...unit, walkInHeldByName: name } : unit;
  });
}
