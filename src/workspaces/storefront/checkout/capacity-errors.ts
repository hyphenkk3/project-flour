export type CapacityDatabaseError = {
  code?: string | null;
  message?: string | null;
};

export type CapacityLookupOutcome = "missing_relation" | "unconfirmed";

export function getConfirmedZeroCapacityDates(input: {
  rows: readonly {
    pickupDate: string;
    cakeId: string;
    sizeId: string | null;
    collectionId: string | null;
    capacityQuantity: number;
  }[];
  cart: readonly { cakeId: string; cakeSizeId: string }[];
  collectionId: string | null;
}): string[] {
  const dates = new Set<string>();
  for (const pickupDate of new Set(input.rows.map((row) => row.pickupDate))) {
    for (const line of input.cart) {
      const matching = input.rows
        .filter(
          (row) =>
            row.pickupDate === pickupDate &&
            row.cakeId === line.cakeId &&
            (row.sizeId === null || row.sizeId === line.cakeSizeId) &&
            (row.collectionId === null || row.collectionId === input.collectionId),
        )
        .sort((left, right) => {
          const sizeSpecificity =
            Number(right.sizeId !== null) - Number(left.sizeId !== null);
          return (
            sizeSpecificity ||
            Number(right.collectionId !== null) -
              Number(left.collectionId !== null)
          );
        });
      if (matching[0]?.capacityQuantity === 0) dates.add(pickupDate);
    }
  }
  return [...dates];
}

function relationIsNamed(message: string, relation: string): boolean {
  const normalized = message.toLowerCase().replace(/["']/g, "");
  return (
    normalized.includes(`public.${relation.toLowerCase()}`) ||
    new RegExp(`\\brelation\\s+${relation.toLowerCase()}\\b`, "i").test(
      normalized,
    )
  );
}

/** Match only an actual missing-relation response for the queried relation. */
export function isMissingRelation(
  error: CapacityDatabaseError,
  relation: string,
): boolean {
  const message = error.message ?? "";
  const normalized = message.toLowerCase();
  if (!relationIsNamed(message, relation)) return false;

  if (error.code === "42P01") {
    return (
      /\brelation\b/.test(normalized) &&
      /does not exist|not exist/.test(normalized)
    );
  }

  // PostgREST reports a missing exposed relation from its schema cache with
  // PGRST205 rather than forwarding PostgreSQL's 42P01.
  return (
    error.code === "PGRST205" &&
    /could not find (the )?table/.test(normalized) &&
    /schema cache/.test(normalized)
  );
}

/** Match only a missing optional column used by the legacy waiting-list fallback. */
export function isMissingWaitingListColumn(
  error: CapacityDatabaseError,
): boolean {
  const message = (error.message ?? "").toLowerCase();
  if (!message.includes("waiting_list_enabled")) return false;
  if (error.code === "42703")
    return /column/.test(message) && /does not exist|not exist/.test(message);
  return (
    error.code === "PGRST204" &&
    /could not find/.test(message) &&
    /column/.test(message) &&
    /schema cache/.test(message)
  );
}

/** Match only the intentional anonymous denial for the advisory capacity table. */
export function isExpectedAdvisoryPermissionDenial(
  error: CapacityDatabaseError,
  relation: string,
): boolean {
  if (error.code !== "42501") return false;
  const message = (error.message ?? "").toLowerCase().replace(/["']/g, "");
  const name = relation.toLowerCase();
  return new RegExp(
    `permission denied for (?:table|relation) (?:public\\.)?${name}\\b`,
  ).test(message);
}

/** A failed optional advisory read must never be presented as availability. */
export function classifyCapacityLookupError(
  error: CapacityDatabaseError,
  relation: string,
): CapacityLookupOutcome {
  return isMissingRelation(error, relation) ? "missing_relation" : "unconfirmed";
}
