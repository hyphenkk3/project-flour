export type CapacityDatabaseError = {
  code?: string | null;
  message?: string | null;
};

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
